import type { DeletedAccounts } from "@liveplace/domain/ports";
import { SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createSessionVerifier } from "./session";

const secret = "s".repeat(32);
const key = new TextEncoder().encode(secret);
const claims = { sub: "user-1", login: "user1", displayName: "User 1" };
// userId → la seconde où son compte a été supprimé.
const deletions = new Map<string, number>();
const deletedAccounts: DeletedAccounts = {
  async isSessionRevoked(userId, issuedAt) {
    const deletedAt = deletions.get(userId);
    return deletedAt !== undefined && issuedAt < deletedAt;
  },
};
const verifier = createSessionVerifier(secret, deletedAccounts);

const sign = (payload: Record<string, unknown>, expiration: string | number, signingKey = key) =>
  new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setExpirationTime(expiration).sign(signingKey);

const cookie = (value: string) => `other=1; lp_session=${value}`;

describe("createSessionVerifier (§10.2)", () => {
  // Rend la session d'un cookie valide
  it("returns the session of a valid cookie", async () => {
    expect(await verifier.verify(cookie(await sign(claims, "30d")))).toEqual({
      userId: claims.sub,
      login: claims.login,
      displayName: claims.displayName,
    });
  });

  // Rend un invité quand le cookie est absent
  it("returns a guest when the cookie is missing", async () => {
    expect(await verifier.verify(undefined)).toBeNull();
    expect(await verifier.verify("other=1")).toBeNull();
  });

  // Rend un invité quand le cookie est signé avec un autre secret
  it("returns a guest when the cookie is signed with another secret", async () => {
    const other = new TextEncoder().encode("a".repeat(32));

    expect(await verifier.verify(cookie(await sign(claims, "30d", other)))).toBeNull();
  });

  // Rend un invité quand le cookie est expiré
  it("returns a guest when the cookie has expired", async () => {
    expect(await verifier.verify(cookie(await sign(claims, "-1h")))).toBeNull();
  });

  // Rend un invité quand le jeton se présente sans signature
  it("returns a guest when the token comes without a signature", async () => {
    expect(await verifier.verify(cookie(new UnsecuredJWT(claims).encode()))).toBeNull();
  });

  // Rend un invité quand le jeton est signé avec un autre algorithme que celui qu'on épingle
  it("returns a guest when the token is signed with another algorithm than the pinned one", async () => {
    const other = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS512" })
      .setExpirationTime("30d")
      .sign(key);

    expect(await verifier.verify(cookie(other))).toBeNull();
  });

  // Rend un invité quand une information d'identité manque
  it("returns a guest when an identity field is missing", async () => {
    expect(await verifier.verify(cookie(await sign({ sub: claims.sub }, "30d")))).toBeNull();
  });

  // Rend un invité quand le compte a été supprimé après l'émission du cookie, mais la session d'une reconnexion passe (CDC §8)
  it("returns a guest when the account was deleted after the cookie was issued, not for a reconnection", async () => {
    const issuedAt = (seconds: number) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(seconds)
        .setExpirationTime("30d")
        .sign(key);
    deletions.set(claims.sub, 2000);

    expect(await verifier.verify(cookie(await issuedAt(1999)))).toBeNull();
    expect(await verifier.verify(cookie(await sign(claims, "30d")))).toBeNull(); // sans `iat` : plus ancien que tout
    expect(await verifier.verify(cookie(await issuedAt(2000)))).toMatchObject({ userId: claims.sub });
    expect(await verifier.verify(cookie(await sign({ ...claims, sub: "user-2" }, "30d")))).toMatchObject({
      userId: "user-2",
    });
    deletions.delete(claims.sub);
  });
});

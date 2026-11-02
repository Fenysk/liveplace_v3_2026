import type { DeletedAccounts } from "@liveplace/domain/ports";
import { SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createSessionSigner, createSessionVerifier } from "./session";

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

const sign = (payload: Record<string, unknown>, expiration: string, signingKey = key, alg = "HS256") =>
  new SignJWT(payload).setProtectedHeader({ alg }).setExpirationTime(expiration).sign(signingKey);

const cookie = (value: string) => `other=1; lp_session=${value}`;

describe("createSessionVerifier, côté web (§10.2, JOURNAL 2026-10-06)", () => {
  // Rend la session du cookie que le web vient de signer
  it("returns the session of the cookie the web signed", async () => {
    const session = { userId: claims.sub, login: claims.login, displayName: claims.displayName };
    expect(await verifier.verify(cookie(await createSessionSigner(secret).sign(session)))).toEqual(session);
  });

  // Rend un invité quand le cookie est absent
  it("returns a guest when the cookie is missing", async () => {
    expect(await verifier.verify(undefined)).toBeNull();
    expect(await verifier.verify("other=1")).toBeNull();
  });

  // Rend un invité quand le cookie est falsifié : un autre secret, sans signature, ou un autre algorithme
  it("returns a guest when the cookie is forged", async () => {
    const other = new TextEncoder().encode("a".repeat(32));
    expect(await verifier.verify(cookie(await sign(claims, "30d", other)))).toBeNull();
    expect(await verifier.verify(cookie(new UnsecuredJWT(claims).encode()))).toBeNull();
    expect(await verifier.verify(cookie(await sign(claims, "30d", key, "HS512")))).toBeNull();
  });

  // Rend un invité quand le cookie est expiré
  it("returns a guest when the cookie has expired", async () => {
    expect(await verifier.verify(cookie(await sign(claims, "-1h")))).toBeNull();
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

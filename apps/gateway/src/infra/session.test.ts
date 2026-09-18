import { SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createSessionVerifier } from "./session";

const secret = "s".repeat(32);
const key = new TextEncoder().encode(secret);
const claims = { sub: "user-1", login: "user1", displayName: "User 1" };
const verifier = createSessionVerifier(secret);

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
});

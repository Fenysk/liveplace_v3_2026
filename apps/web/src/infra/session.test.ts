import { SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createSessionSigner, createSessionVerifier } from "./session";

const secret = "s".repeat(32);
const key = new TextEncoder().encode(secret);
const claims = { sub: "user-1", login: "user1", displayName: "User 1" };
const verifier = createSessionVerifier(secret);

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
});

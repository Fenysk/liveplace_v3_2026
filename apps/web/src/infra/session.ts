// La signature du cookie de session (§10.2) : le gateway la vérifie avec le même secret.

import { SESSION_ALGORITHM, SESSION_TTL_SECONDS, toSessionClaims } from "@liveplace/domain";
import type { SessionSigner } from "@liveplace/domain/ports";
import { SignJWT } from "jose";

export function createSessionSigner(secret: string): SessionSigner {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (session) =>
      new SignJWT(toSessionClaims(session))
        .setProtectedHeader({ alg: SESSION_ALGORITHM })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(key),
  };
}

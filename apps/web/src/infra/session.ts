// Le cookie de session (§10.2) : signé ici, vérifié par le gateway avec le même secret.

import {
  SESSION_ALGORITHM,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  toSession,
  toSessionClaims,
} from "@liveplace/domain";
import type { DeletedAccounts, SessionSigner, SessionVerifier } from "@liveplace/domain/ports";
import { cookieValue } from "@liveplace/shared";
import { jwtVerify, SignJWT } from "jose";
import { JOSEError } from "jose/errors";

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

// §10.2 : le web lit aussi le cookie, pour l'affichage seulement. Même règle que le gateway.
export function createSessionVerifier(secret: string, deletedAccounts: DeletedAccounts): SessionVerifier {
  const key = new TextEncoder().encode(secret);
  return {
    async verify(cookieHeader) {
      const signed = cookieValue(cookieHeader, SESSION_COOKIE);
      if (!signed) return null;
      try {
        const verified = await jwtVerify(signed, key, { algorithms: [SESSION_ALGORITHM] });
        const session = toSession(verified.payload);
        // CDC §8 : la session d'un compte supprimé depuis son émission vaut un invité (JOURNAL 2026-11-01).
        if (session && (await deletedAccounts.isSessionRevoked(session.userId, verified.payload.iat ?? 0)))
          return null;
        return session;
      } catch (error) {
        // Signature fausse, jeton expiré, jeton illisible : un invité, jamais une erreur.
        if (error instanceof JOSEError) return null;
        throw error;
      }
    },
  };
}

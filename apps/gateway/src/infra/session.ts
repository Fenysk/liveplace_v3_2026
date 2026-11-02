// Le cookie de session, vérifié localement, sans réseau (D-09, §10.2).

import { SESSION_ALGORITHM, SESSION_COOKIE, toSession } from "@liveplace/domain";
import type { DeletedAccounts, SessionVerifier } from "@liveplace/domain/ports";
import { cookieValue } from "@liveplace/shared";
import { jwtVerify } from "jose";
import { JOSEError } from "jose/errors";

export function createSessionVerifier(secret: string, deletedAccounts: DeletedAccounts): SessionVerifier {
  const key = new TextEncoder().encode(secret);
  return {
    async verify(cookieHeader) {
      const signed = cookieValue(cookieHeader, SESSION_COOKIE);
      if (!signed) return null;
      try {
        // L'algorithme est épinglé : l'en-tête d'un jeton est écrit par celui qui le fabrique.
        const verified = await jwtVerify(signed, key, { algorithms: [SESSION_ALGORITHM] });
        const session = toSession(verified.payload);
        // CDC §8 : la session d'un compte supprimé depuis son émission vaut un invité (JOURNAL 2026-11-01).
        if (session && (await deletedAccounts.isSessionRevoked(session.userId, verified.payload.iat ?? 0)))
          return null;
        return session;
      } catch (error) {
        // Signature fausse, jeton expiré, jeton illisible : un invité, jamais une erreur (§10.2).
        if (error instanceof JOSEError) return null;
        throw error;
      }
    },
  };
}

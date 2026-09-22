// Le cookie de session, vérifié localement, sans réseau (D-09, §10.2).

import { SESSION_ALGORITHM, SESSION_COOKIE, toSession } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import { jwtVerify } from "jose";
import { JOSEError } from "jose/errors";

const cookieValue = (header: string | undefined, name: string): string | undefined =>
  header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export function createSessionVerifier(secret: string): SessionVerifier {
  const key = new TextEncoder().encode(secret);
  return {
    async verify(cookieHeader) {
      const signed = cookieValue(cookieHeader, SESSION_COOKIE);
      if (!signed) return null;
      try {
        // L'algorithme est épinglé : l'en-tête d'un jeton est écrit par celui qui le fabrique.
        const verified = await jwtVerify(signed, key, { algorithms: [SESSION_ALGORITHM] });
        return toSession(verified.payload);
      } catch (error) {
        // Signature fausse, jeton expiré, jeton illisible : un invité, jamais une erreur (§10.2).
        if (error instanceof JOSEError) return null;
        throw error;
      }
    },
  };
}

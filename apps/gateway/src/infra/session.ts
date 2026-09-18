// Le cookie de session, vérifié localement, sans réseau (D-09, §10.2).

import type { Session } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import { type JWTPayload, jwtVerify } from "jose";
import { JOSEError } from "jose/errors";

const COOKIE_NAME = "lp_session";

const cookieValue = (header: string | undefined, name: string): string | undefined =>
  header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const toSession = (claims: JWTPayload): Session | null => {
  const { sub, login, displayName } = claims;
  if (typeof sub !== "string" || typeof login !== "string" || typeof displayName !== "string") return null;
  return { userId: sub, login, displayName };
};

export function createSessionVerifier(secret: string): SessionVerifier {
  const key = new TextEncoder().encode(secret);
  return {
    async verify(cookieHeader) {
      const signed = cookieValue(cookieHeader, COOKIE_NAME);
      if (!signed) return null;
      try {
        // L'algorithme est épinglé : l'en-tête d'un jeton est écrit par celui qui le fabrique.
        const verified = await jwtVerify(signed, key, { algorithms: ["HS256"] });
        return toSession(verified.payload);
      } catch (error) {
        // Signature fausse, jeton expiré, jeton illisible : un invité, jamais une erreur (§10.2).
        if (error instanceof JOSEError) return null;
        throw error;
      }
    },
  };
}

export { COOKIE_NAME };

// Lire les réponses de Redis (ioredis les rend en `unknown`) et balayer ses clés : ce que le snapshot et le timelapse lisent de la même façon.

import type { Redis } from "ioredis";

const SCAN_COUNT = 1000;

export type Replies = [Error | null, unknown][];

// La réponse d'un pipeline ou d'un MULTI, une valeur par commande : une erreur de commande remonte.
export const valuesOf = (replies: Replies | null): unknown[] => {
  if (!replies) throw new Error("transaction annulée");
  return replies.map(([error, value]) => {
    if (error) throw error;
    return value;
  });
};

export const stringsOf = (reply: unknown): string[] => {
  if (!Array.isArray(reply) || !reply.every((item) => typeof item === "string"))
    throw new Error("réponse Redis : une liste de chaînes était attendue");
  return reply;
};

export const fieldsOf = (reply: unknown): Record<string, string> => {
  const isHash =
    typeof reply === "object" &&
    reply !== null &&
    Object.values(reply).every((value) => typeof value === "string");
  if (!isHash) throw new Error("réponse Redis : un hash de chaînes était attendu");
  return Object.fromEntries(Object.entries(reply));
};

// Un identifiant de canvas n'est jamais un motif : les caractères de SCAN y perdent leur sens.
export const escapeGlob = (name: string): string => name.replace(/[\\*?[\]]/g, "\\$&");

// Les clés qui correspondent au motif, sans jamais bloquer Redis : un curseur, quelques milliers de clés par tour.
export async function* scanNames(redis: Redis, match: string): AsyncGenerator<string> {
  for await (const names of redis.scanStream({ match, count: SCAN_COUNT })) yield* names;
}

// Utilitaires sans métier (§3.1).

import type { z } from "zod";

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

// Fail-closed (§11.5) : le process refuse de démarrer, et l'erreur nomme la variable fautive.
export function parseEnv<Schema extends z.ZodType>(schema: Schema, env: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  // Les noms, jamais les valeurs : l'erreur part dans les logs du conteneur.
  const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(`Variables d'environnement invalides ou absentes : ${names.join(", ")}`);
}

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

// La valeur d'un cookie dans l'en-tête `Cookie`, sans le décoder.
export function cookieValue(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

// Nos cookies sont tous HttpOnly, SameSite=Lax et valables sur tout le site. Une durée nulle l'efface.
export function serializeCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  isSecure: boolean,
): string {
  const attributes = [`${name}=${value}`, "Path=/", `Max-Age=${maxAgeSeconds}`, "HttpOnly", "SameSite=Lax"];
  if (isSecure) attributes.push("Secure");
  return attributes.join("; ");
}

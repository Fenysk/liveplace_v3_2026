// Utilitaires sans métier (§3.1).

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

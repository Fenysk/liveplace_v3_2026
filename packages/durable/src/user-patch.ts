// §8.1 : ce que la connexion d'un compte déjà connu change dans sa ligne, pur pour se tester sans Convex. `upsertFromTwitch`
// l'applique par `db.patch`, qui retire un champ mis à `undefined`.
// Aucun import : les fonctions Convex sont empaquetées seules, sans les packages du dépôt.

export type SignedInFields = {
  login: string;
  displayName: string;
  avatarUrl: string;
  email?: string | undefined;
};

// L'e-mail est celui de ce jeton, jamais celui d'avant : un jeton qui n'a plus le droit `user:read:email` (une réduction de
// portée) ou un compte sans e-mail vérifié n'en porte aucun, et l'e-mail gardé part (contrat Twitch VI.F, CDC §8).
export const toUserPatch = (
  { login, displayName, avatarUrl, email }: SignedInFields,
  now: number,
): SignedInFields & { lastSignInAt: number } => ({ login, displayName, avatarUrl, email, lastSignInAt: now });

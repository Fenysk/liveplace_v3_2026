// Le lien d'un don Ko-fi à un compte (CDC des badges §3, JOURNAL 2026-11-03), pur pour se tester sans Convex.
// Aucun import : les fonctions Convex sont empaquetées seules, sans les packages du dépôt.

// En minuscules et sans espaces, la forme sous laquelle l'e-mail se compare ; `undefined` : il n'y en a pas.
export const normalizeEmail = (raw: string | undefined): string | undefined => {
  const email = raw?.trim().toLowerCase();
  return email === "" ? undefined : email;
};

// Twitch permet plusieurs comptes par e-mail : un don ne se relie que si un seul compte le porte, les autres cas attendent
// le choix du développeur.
export const soleAccountOf = (userIds: readonly string[]): string | undefined => {
  const accounts = new Set(userIds);
  const [first] = accounts;
  return accounts.size === 1 ? first : undefined;
};

// Le pseudo Twitch tel qu'on le compare : sans espaces ni « @ » devant, en minuscules (Twitch les écrit ainsi).
export const normalizeLogin = (raw: string): string => raw.trim().replace(/^@/, "").toLowerCase();

// Un pseudo libéré chez Twitch peut être repris : le compte connecté le plus récemment l'emporte.
export const latestAccountOf = <Account extends { lastSignInAt: number }>(
  accounts: readonly Account[],
): Account | undefined =>
  accounts.reduce<Account | undefined>(
    (latest, account) => (latest && latest.lastSignInAt >= account.lastSignInAt ? latest : account),
    undefined,
  );

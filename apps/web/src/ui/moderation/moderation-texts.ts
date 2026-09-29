// Les phrases de la modération (JOURNAL 2026-09-25) : la confirmation, la fenêtre du banni et l'onglet Modération.

// Une modération coupée ne repart pas à la reconnexion, contrairement aux lots : on la relance.
export const CONNECTION_LOST =
  "La connexion a sauté. Réessaie dans un instant : la page se reconnecte seule.";

// JOURNAL 2026-09-28 : combien de comptes ont signalé une pose.
export function reportCountLabel(count: number): string {
  return count === 1 ? "1 signalement" : `${count.toLocaleString("fr-FR")} signalements`;
}

// D'où vient le rôle d'un modérateur, sous son nom dans l'onglet Modération.
export function moderatorMention({
  isFromTwitch,
  isNamedHere,
}: {
  isFromTwitch: boolean;
  isNamedHere: boolean;
}): string {
  if (isFromTwitch && isNamedHere) return "Modérateur sur Twitch et LivePlace";
  return isFromTwitch ? "Modérateur sur Twitch" : "Modérateur sur LivePlace";
}

// Un ban n'a qu'une origine (moderate.lua) : le premier posé la garde.
export function banMention(isFromTwitch: boolean): string {
  return isFromTwitch ? "Banni sur Twitch" : "Banni sur LivePlace";
}

export function pixelCountLabel(count: number): string {
  if (count === 0) return "Aucun pixel visible";
  return count === 1 ? "1 pixel" : `${count.toLocaleString("fr-FR")} pixels`;
}

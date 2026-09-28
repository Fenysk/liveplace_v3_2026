// Les phrases de la modération (JOURNAL 2026-09-25) : la confirmation, la fenêtre du banni et l'onglet Modération.

// Une modération coupée ne repart pas à la reconnexion, contrairement aux lots : on la relance.
export const CONNECTION_LOST =
  "La connexion a sauté. Réessaie dans un instant : la page se reconnecte seule.";

// JOURNAL 2026-09-28 : combien de comptes ont signalé une pose.
export function reportCountLabel(count: number): string {
  return count === 1 ? "1 signalement" : `${count.toLocaleString("fr-FR")} signalements`;
}

export function pixelCountLabel(count: number): string {
  if (count === 0) return "Aucun pixel visible";
  return count === 1 ? "1 pixel" : `${count.toLocaleString("fr-FR")} pixels`;
}

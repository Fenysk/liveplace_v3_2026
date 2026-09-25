// Les phrases de la modération (JOURNAL 2026-09-25) : la confirmation, la fenêtre du banni et l'onglet Modération.

// Sans reconnexion (J12), une connexion perdue ne revient qu'au rechargement de la page.
export const CONNECTION_LOST = "Connexion perdue : recharge la page, puis réessaie.";

export function pixelCountLabel(count: number): string {
  if (count === 0) return "Aucun pixel visible";
  return count === 1 ? "1 pixel" : `${count.toLocaleString("fr-FR")} pixels`;
}

// Les textes de la section Badges (JOURNAL 2026-11-03), en français comme le reste de la fenêtre Développeur : le jour d'un don, et
// ce que dit une ligne quand « Relier » échoue.

import type { DonationLinkRefusal } from "@liveplace/domain/ports";

const DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

// « 2 novembre 2026 » : le jour de Paris, comme les jours du suivi.
export const formatDonationDay = (donatedAt: number): string => DAY.format(donatedAt);

// `failed` : ni refus de Convex ni lien fait, une panne ou une session perdue ; la ligne garde son champ et dit de réessayer.
export type LinkFailure = DonationLinkRefusal | "failed";

export const linkFailureText = (failure: LinkFailure): string => {
  switch (failure) {
    case "unknown_account":
      return "Aucun compte ne porte ce pseudo.";
    case "already_linked":
      return "Ce don est déjà relié.";
    case "unknown_donation":
      return "Ce don n'existe plus.";
    case "failed":
      return "Le lien n'a pas pu se faire. Réessaie.";
  }
};

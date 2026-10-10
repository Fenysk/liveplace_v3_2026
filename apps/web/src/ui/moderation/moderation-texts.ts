// Les phrases de la modération (JOURNAL 2026-09-25) : la confirmation, la fenêtre du banni et l'onglet Modération.
// Écart §14 (JOURNAL 2026-10-07) : chacune en français et en anglais.

import { formatNumber, isSingular } from "../locale/locale";
import { defineTexts, localized } from "../locale/texts";

type Mention = { isFromTwitch: boolean; isNamedHere: boolean };

export const MODERATION_TEXTS = defineTexts({
  // Une modération coupée ne repart pas à la reconnexion, contrairement aux lots : on la relance.
  connectionLost: {
    fr: "La connexion a sauté. Réessaie dans un instant : la page se reconnecte seule.",
    en: "The connection dropped. Try again in a moment: the page reconnects by itself.",
  },

  // JOURNAL 2026-09-28 : combien de comptes ont signalé une pose.
  reportCount: localized({
    fr: (count: number) =>
      isSingular(count, "fr") ? `${count} signalement` : `${formatNumber(count, "fr")} signalements`,
    en: (count) => (isSingular(count, "en") ? `${count} report` : `${formatNumber(count, "en")} reports`),
  }),

  pixelCount: localized({
    fr: (count: number) => {
      if (count === 0) return "Aucun pixel visible";
      return isSingular(count, "fr") ? `${count} pixel` : `${formatNumber(count, "fr")} pixels`;
    },
    en: (count) => {
      if (count === 0) return "No visible pixels";
      return isSingular(count, "en") ? `${count} pixel` : `${formatNumber(count, "en")} pixels`;
    },
  }),

  // Le toast de Rétablir : une pose, ou toutes celles d'une ligne de signalements (JOURNAL 2026-10-07).
  approvedToast: localized({
    fr: (placementCount: number) =>
      placementCount > 1
        ? "Poses rétablies : elles reviennent sur le stream"
        : "Pose rétablie : elle revient sur le stream",
    en: (placementCount) =>
      placementCount > 1
        ? "Placements restored: they are back on the stream"
        : "Placement restored: it is back on the stream",
  }),

  // D'où vient le rôle d'un modérateur, sous son nom dans l'onglet Modération.
  moderatorMention: localized({
    fr: ({ isFromTwitch, isNamedHere }: Mention) => {
      if (isFromTwitch && isNamedHere) return "Modérateur sur Twitch et LivePlace";
      return isFromTwitch ? "Modérateur sur Twitch" : "Modérateur sur LivePlace";
    },
    en: ({ isFromTwitch, isNamedHere }) => {
      if (isFromTwitch && isNamedHere) return "Moderator on Twitch and LivePlace";
      return isFromTwitch ? "Moderator on Twitch" : "Moderator on LivePlace";
    },
  }),

  // Un ban n'a qu'une origine (moderate.lua) : le premier posé la garde.
  banMention: localized({
    fr: (isFromTwitch: boolean) => (isFromTwitch ? "Banni sur Twitch" : "Banni sur LivePlace"),
    en: (isFromTwitch) => (isFromTwitch ? "Banned on Twitch" : "Banned on LivePlace"),
  }),

  previewLoading: { fr: "Chargement de l'aperçu…", en: "Loading the preview…" },
  pixelsOf: localized({
    fr: (name: string) => `Les pixels de ${name}`,
    en: (name) => `${name}'s pixels`,
  }),

  // L'onglet Modération.
  reports: { fr: "Signalements", en: "Reports" },
  noReports: { fr: "Aucun signalement en attente.", en: "No pending reports." },
  hiddenFromStream: { fr: "Cachée du stream", en: "Hidden from the stream" },
  reportedPlacementPreview: localized({
    fr: ({ hasSeveral, name }: { hasSeveral: boolean; name: string }) =>
      `${hasSeveral ? "Les poses signalées" : "La pose signalée"} de ${name}`,
    en: ({ hasSeveral, name }) => `${name}'s reported ${hasSeveral ? "placements" : "placement"}`,
  }),
  clearPlacements: {
    fr: { one: "Retirer la pose", several: "Retirer les poses" },
    en: { one: "Clear the placement", several: "Clear the placements" },
  },
  ban: { fr: "Bannir", en: "Ban" },
  unban: { fr: "Débannir", en: "Unban" },
  restore: { fr: "Rétablir", en: "Restore" },
  bannedUsers: { fr: "Utilisateurs bannis", en: "Banned users" },
  nobodyBanned: { fr: "Personne n'est banni.", en: "Nobody is banned." },
  seeTheirPixels: { fr: "Voir ses pixels", en: "See their pixels" },
  moderators: { fr: "Modérateurs", en: "Moderators" },
  noModerators: { fr: "Aucun modérateur.", en: "No moderators." },
  removeModerator: { fr: "Retirer", en: "Remove" },
  moderatorRemoved: { fr: "Modérateur·rice retiré·e", en: "Moderator removed" },
  unbanned: {
    fr: "Débanni·e : ce compte peut de nouveau poser",
    en: "Unbanned: this account can place again",
  },

  // La synchro Twitch du streamer.
  twitchSync: { fr: "Synchronisation Twitch", en: "Twitch sync" },
  syncNever: {
    fr: "Tes modérateurs et tes bannis Twitch le deviennent ici, et le restent quand tu changes quelque chose sur Twitch. LivePlace ne fait que les lire.",
    en: "Your Twitch moderators and bans carry over here, and stay in sync when you change something on Twitch. LivePlace only reads them.",
  },
  syncOk: localized({
    fr: (syncedAt: string) =>
      `Synchronisé le ${syncedAt}. Chaque changement sur Twitch arrive ici tout seul.`,
    en: (syncedAt) => `Synced on ${syncedAt}. Every change on Twitch arrives here by itself.`,
  }),
  syncRevoked: {
    fr: "Tu as retiré l'accès de LivePlace sur Twitch : les changements n'arrivent plus. Synchronise de nouveau.",
    en: "You removed LivePlace's access on Twitch: changes no longer arrive. Sync again.",
  },
  syncWithTwitch: { fr: "Synchroniser avec Twitch", en: "Sync with Twitch" },
  syncAgain: { fr: "Synchroniser de nouveau", en: "Sync again" },

  // Le rôle d'un compte, nommé ou retiré depuis la pill Inspection (toasts).
  roleNotChanged: {
    fr: "Le rôle n'a pas changé : réessaie dans un instant.",
    en: "The role didn't change: try again in a moment.",
  },
  roleChanged: localized({
    fr: ({ name, isModerator }: { name: string; isModerator: boolean }) =>
      `${name} ${isModerator ? "est" : "n'est plus"} modérateur·rice`,
    en: ({ name, isModerator }) => `${name} ${isModerator ? "is now" : "is no longer"} a moderator`,
  }),
  bannedToast: localized({
    fr: (name: string) => `${name} est banni·e de cette fresque`,
    en: (name) => `${name} is banned from this canvas`,
  }),
  reportSent: { fr: "Signalement envoyé", en: "Report sent" },
  reportRefused: {
    fr: "Signalement refusé : la case a changé, ou la pose ne se signale plus.",
    en: "Report refused: the cell changed, or the placement can no longer be reported.",
  },

  // La fenêtre de confirmation.
  banTitle: localized({ fr: (name: string) => `Bannir ${name} ?`, en: (name) => `Ban ${name}?` }),
  banAfterClearTitle: localized({
    fr: (name: string) => `C'est retiré. Bannir aussi ${name} ?`,
    en: (name) => `Cleared. Ban ${name} too?`,
  }),
  reportTitle: localized({
    fr: ({ name, isSingle }: { name: string; isSingle: boolean }) =>
      isSingle ? `Signaler cette pose de ${name} ?` : `Signaler ces poses de ${name} ?`,
    en: ({ name, isSingle }) =>
      isSingle ? `Report this placement by ${name}?` : `Report these placements by ${name}?`,
  }),
  clearAllTitle: localized({
    fr: (name: string) => `Retirer tous les pixels de ${name} ?`,
    en: (name) => `Clear all of ${name}'s pixels?`,
  }),
  clearTitle: localized({
    fr: ({ name, isSingle }: { name: string; isSingle: boolean }) =>
      isSingle ? `Retirer cette pose de ${name} ?` : `Retirer ces poses de ${name} ?`,
    en: ({ name, isSingle }) =>
      isSingle ? `Clear this placement by ${name}?` : `Clear these placements by ${name}?`,
  }),
  banConsequence: {
    fr: "Ce compte ne pourra plus poser sur cette fresque, et ses pixels seront retirés.",
    en: "This account will no longer be able to place on this canvas, and its pixels will be cleared.",
  },
  clearConsequence: { fr: "Ceux du dessous reviendront.", en: "The ones underneath will come back." },
  reportConsequence: {
    fr: "Assez de signalements, et la pose quitte le stream jusqu'à la décision d'un modérateur.",
    en: "Enough reports, and the placement leaves the stream until a moderator decides.",
  },
  clear: { fr: "Retirer", en: "Clear" },
  report: { fr: "Signaler", en: "Report" },
  no: { fr: "Non", en: "No" },
  clearAllPixels: { fr: "Retirer tous ses pixels", en: "Clear all their pixels" },
  timeRange: { fr: "Plage de temps", en: "Time range" },
  // Les crans de la plage : une pose seule, ou ses voisines dans une plage d'heures (± 1 min… ± 1 h).
  spanPlacementOnly: { fr: "Cette pose seule", en: "This placement only" },
  spanReportedPlacements: { fr: "Les poses signalées", en: "The reported placements" },

  // La fenêtre du banni.
  bannedTitle: { fr: "Tu es banni·e de cette fresque", en: "You're banned from this canvas" },
  understood: { fr: "Je comprends", en: "Got it" },
  bannedProof: {
    fr: "Les pixels qui t'ont valu ce bannissement ont été retirés :",
    en: "The pixels that got you banned were cleared:",
  },
  yourClearedPixels: { fr: "Tes pixels retirés", en: "Your cleared pixels" },
  watchOnly: { fr: "Tu peux seulement regarder la fresque.", en: "You can only watch the canvas." },
});

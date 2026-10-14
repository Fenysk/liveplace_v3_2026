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
  // Sur la ligne dont l'action a échoué, Écart §8.1 (JOURNAL 2026-10-13) : elle relance la même.
  retry: { fr: "Réessayer", en: "Try again" },

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

  // Le toast de Rétablir : un dessin, ou tous ceux d'une ligne de signalements (JOURNAL 2026-10-07).
  approvedToast: localized({
    fr: (placementCount: number) =>
      placementCount > 1
        ? "Dessins rétablis : ils reviennent sur le stream"
        : "Dessin rétabli : il revient sur le stream",
    en: (placementCount) =>
      placementCount > 1
        ? "Drawings restored: they are back on the stream"
        : "Drawing restored: it is back on the stream",
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
  hiddenFromStream: { fr: "Caché du stream", en: "Hidden from the stream" },
  reportedPlacementPreview: localized({
    fr: ({ hasSeveral, name }: { hasSeveral: boolean; name: string }) =>
      `${hasSeveral ? "Les dessins signalés" : "Le dessin signalé"} de ${name}`,
    en: ({ hasSeveral, name }) => `${name}'s reported ${hasSeveral ? "drawings" : "drawing"}`,
  }),
  clearPlacements: {
    fr: { one: "Effacer le dessin", several: "Effacer les dessins" },
    en: { one: "Clear the drawing", several: "Clear the drawings" },
  },
  ban: { fr: "Bannir", en: "Ban" },
  unban: { fr: "Débannir", en: "Unban" },
  restore: { fr: "Rétablir", en: "Restore" },
  bannedUsers: { fr: "Viewers bannis", en: "Banned viewers" },
  nobodyBanned: { fr: "Personne n'est banni.", en: "Nobody is banned." },
  seeTheirPixels: { fr: "Voir ses pixels", en: "See their pixels" },
  moderators: { fr: "Modérateurs", en: "Moderators" },
  noModerators: { fr: "Aucun modérateur.", en: "No moderators." },
  removeModerator: { fr: "Retirer le rôle", en: "Remove the role" },
  moderatorRemoved: { fr: "Modérateur·rice retiré·e", en: "Moderator removed" },
  unbanned: {
    fr: "Débanni·e : ce viewer peut de nouveau dessiner",
    en: "Unbanned: this viewer can draw again",
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
    fr: "Signalement refusé : la case a changé, ou le dessin ne se signale plus.",
    en: "Report refused: the cell changed, or the drawing can no longer be reported.",
  },

  // La fenêtre de confirmation.
  banTitle: localized({ fr: (name: string) => `Bannir ${name} ?`, en: (name) => `Ban ${name}?` }),
  banAfterClearTitle: localized({
    fr: (name: string) => `C'est effacé. Bannir aussi ${name} ?`,
    en: (name) => `Cleared. Ban ${name} too?`,
  }),
  reportTitle: localized({
    fr: ({ name, isSingle }: { name: string; isSingle: boolean }) =>
      isSingle ? `Signaler ce dessin de ${name} ?` : `Signaler ces dessins de ${name} ?`,
    en: ({ name, isSingle }) =>
      isSingle ? `Report this drawing by ${name}?` : `Report these drawings by ${name}?`,
  }),
  clearAllTitle: localized({
    fr: (name: string) => `Effacer tous les dessins de ${name} ?`,
    en: (name) => `Clear all of ${name}'s drawings?`,
  }),
  clearTitle: localized({
    fr: ({ name, isSingle }: { name: string; isSingle: boolean }) =>
      isSingle ? `Effacer ce dessin de ${name} ?` : `Effacer ces dessins de ${name} ?`,
    en: ({ name, isSingle }) =>
      isSingle ? `Clear this drawing by ${name}?` : `Clear these drawings by ${name}?`,
  }),
  banConsequence: {
    fr: "Ce viewer ne pourra plus dessiner sur cette fresque, et ses dessins seront effacés.",
    en: "This viewer will no longer be able to draw on this canvas, and their drawings will be cleared.",
  },
  clearConsequence: { fr: "Ceux du dessous reviendront.", en: "The ones underneath will come back." },
  reportConsequence: {
    fr: "Assez de signalements, et le dessin quitte le stream jusqu'à la décision d'un modérateur.",
    en: "Enough reports, and the drawing leaves the stream until a moderator decides.",
  },
  clear: { fr: "Effacer", en: "Clear" },
  report: { fr: "Signaler", en: "Report" },
  no: { fr: "Non", en: "No" },
  clearAllPixels: { fr: "Effacer tous ses dessins", en: "Clear all their drawings" },
  timeRange: { fr: "Plage de temps", en: "Time range" },
  // Les crans de la plage : un dessin seul, ou ses voisins dans une plage d'heures (« 5 min avant et après ce dessin »).
  spanPlacementOnly: { fr: "Ce dessin seul", en: "This drawing only" },
  spanReportedPlacements: { fr: "Les dessins signalés", en: "The reported drawings" },
  spanAround: localized({
    fr: ({ duration, hasSeveral }: { duration: string; hasSeveral: boolean }) =>
      `${duration} avant et après ${hasSeveral ? "ces dessins" : "ce dessin"}`,
    en: ({ duration, hasSeveral }) =>
      `${duration} before and after ${hasSeveral ? "these drawings" : "this drawing"}`,
  }),

  // La fenêtre du banni.
  bannedTitle: { fr: "Tu es banni·e de cette fresque", en: "You're banned from this canvas" },
  understood: { fr: "Je comprends", en: "Got it" },
  bannedProof: {
    fr: "Les dessins qui t'ont valu ce bannissement ont été effacés :",
    en: "The drawings that got you banned were cleared:",
  },
  yourClearedPixels: { fr: "Tes dessins effacés", en: "Your cleared drawings" },
  watchOnly: { fr: "Tu peux seulement regarder la fresque.", en: "You can only watch the canvas." },
});

// Les phrases du mode événement (CDC 2026, Mode événement) : la section de Menu > Fresque, le compte à rebours, le toast d'un don.

import type { CharityInactiveReason } from "@liveplace/domain/charity-event";
import { formatNumber, isSingular } from "../locale/locale";
import { defineTexts, localized } from "../locale/texts";

const INACTIVE_FR: Record<CharityInactiveReason, string> = {
  title: "il manque le titre",
  start: "il manque le début",
  order: "la fin vient avant le début",
  address: "pas une page Streamlabs Charity",
};
const INACTIVE_EN: Record<CharityInactiveReason, string> = {
  title: "the title is missing",
  start: "the start is missing",
  order: "the end comes before the start",
  address: "not a Streamlabs Charity page",
};

export const CHARITY_TEXTS = defineTexts({
  title: { fr: "Événement Streamlabs Charity", en: "Streamlabs Charity event" },
  on: { fr: "Activé", en: "On" },
  off: { fr: "Désactivé", en: "Off" },
  eventTitle: { fr: "Titre", en: "Title" },
  address: { fr: "Page de dons Streamlabs (facultatif)", en: "Streamlabs donation page (optional)" },
  startsAt: { fr: "Début", en: "Start" },
  endsAt: { fr: "Fin (facultative)", en: "End (optional)" },
  // Le nom accessible des champs d'heure ; la légende dessous les dit pour les deux lignes.
  startTime: { fr: "Heure du début (facultative)", en: "Start time (optional)" },
  endTime: { fr: "Heure de la fin (facultative)", en: "End time (optional)" },
  timeNote: { fr: "Heure (facultative)", en: "Time (optional)" },
  // JOURNAL 2026-11-21 : le dessin seulement entre le début et la fin.
  eventOnly: { fr: "Dessin seulement pendant l'événement", en: "Drawing only during the event" },
  eventOnlyNote: {
    fr: "Les viewers ne dessinent qu'entre le début et la fin. Toi, tu dessines toujours.",
    en: "Viewers can only draw between the start and the end. You can always draw.",
  },
  lost: { fr: "Connexion perdue : réessaie dans un instant.", en: "Connection lost: try again in a moment." },
  saved: { fr: "Événement enregistré", en: "Event saved" },
  // L'état sous le titre de la section : rouge quand l'événement est activé sans pouvoir avoir lieu.
  inactive: localized({
    fr: (reason: CharityInactiveReason) => `Inactif : ${INACTIVE_FR[reason]}`,
    en: (reason) => `Inactive: ${INACTIVE_EN[reason]}`,
  }),
  upcoming: localized({
    fr: (countdown: string) => `À venir · dans ${countdown}`,
    en: (countdown) => `Upcoming · in ${countdown}`,
  }),
  running: localized({
    fr: (count: number) =>
      `En cours · ${formatNumber(count, "fr")} ${isSingular(count, "fr") ? "don" : "dons"}`,
    en: (count) =>
      `Running · ${formatNumber(count, "en")} ${isSingular(count, "en") ? "donation" : "donations"}`,
  }),
  // Après la fin, le switch encore activé : en gris, jamais en rouge.
  ended: localized({
    fr: (count: number) =>
      `Terminé · ${formatNumber(count, "fr")} ${isSingular(count, "fr") ? "don" : "dons"}`,
    en: (count) =>
      `Ended · ${formatNumber(count, "en")} ${isSingular(count, "en") ? "donation" : "donations"}`,
  }),
  // La 2e ligne de la pastille, sous le titre de l'événement : le compte à rebours avant le début, « En cours », puis la dernière heure
  // avant une fin.
  startsIn: localized({
    fr: (countdown: string) => `Commence dans ${countdown}`,
    en: (countdown) => `Starts in ${countdown}`,
  }),
  liveNow: { fr: "En cours", en: "Live now" },
  eventEnded: { fr: "Événement terminé", en: "Event ended" },
  endsIn: localized({
    fr: (countdown: string) => `Se termine dans ${countdown}`,
    en: (countdown) => `Ends in ${countdown}`,
  }),
  // Le nom d'un don anonyme, dans le toast.
  unnamed: { fr: "Anonyme", en: "Anonymous" },
});

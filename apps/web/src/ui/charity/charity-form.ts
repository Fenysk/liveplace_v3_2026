// Ce que le formulaire de l'événement calcule, sans écran : les champs, le réglage qui part au gateway, la ligne d'état et le texte d'un refus.

import { type CharityEventStatus, charityCountdownOf, toCharityTitle } from "@liveplace/domain/charity-event";
import type { CharityEventSetting, CharityEventView, RequestResult } from "../../state/canvas-store";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import type { Locale } from "../locale/locale";
import type { CharityFields, CharitySectionProps } from "./charity-section";
import type { CHARITY_TEXTS } from "./charity-texts";
import { formatCountdown, fromLocalFields, toLocalDate, toLocalTime } from "./charity-time";

export type CharityState = NonNullable<CharityEventView["state"]>;
type CharityTexts = (typeof CHARITY_TEXTS)["fr"];
export type Edits = Partial<CharityFields>;

export type Failure = NonNullable<CharitySectionProps["failure"]>;
export type FailureCode = Extract<RequestResult<true>, { ok: false }>["error"];

// Un refus ne vise aucun champ : le gateway ne refuse plus un réglage, seule la connexion peut manquer.
export const refusalOf = (code: FailureCode, locale: Locale, t: CharityTexts): Failure => {
  if (code === "closed" || code === "drawing_closed") return { text: t.lost };
  return { text: DRAFT_TEXTS[locale].refusal(code) };
};

// La ligne sous le titre de la section : en rouge quand l'événement est activé sans pouvoir avoir lieu.
export const statusLineOf = (
  status: CharityEventStatus,
  nowMs: number,
  donationCount: number,
  locale: Locale,
  t: CharityTexts,
): NonNullable<CharitySectionProps["statusLine"]> => {
  if (status.kind === "off") return { text: t.off, isDanger: false };
  if (status.kind === "inactive") return { text: t.inactive(status.reason), isDanger: true };
  if (status.kind === "upcoming") {
    const countdown = formatCountdown(charityCountdownOf(status.startsAt - nowMs), locale);
    return { text: t.upcoming(countdown), isDanger: false };
  }
  if (status.kind === "ended") return { text: t.ended(donationCount), isDanger: false };
  return { text: t.running(donationCount), isDanger: false };
};

export const fieldsOf = (state: CharityState | undefined, edits: Edits): CharityFields => ({
  title: edits.title ?? state?.title ?? "",
  address: edits.address ?? state?.address ?? "",
  startDate: edits.startDate ?? (state?.startsAt === undefined ? "" : toLocalDate(state.startsAt)),
  startTime: edits.startTime ?? (state?.startsAt === undefined ? "" : toLocalTime(state.startsAt)),
  endDate: edits.endDate ?? (state?.endsAt === undefined ? "" : toLocalDate(state.endsAt)),
  endTime: edits.endTime ?? (state?.endsAt === undefined ? "" : toLocalTime(state.endsAt)),
});

// Une borne dont ni la date ni l'heure n'ont été modifiées garde celle de l'état, à la seconde près (un champ n'a que la minute) ; sinon elle
// se lit dans ses deux champs (sans date : aucune borne).
const boundOf = (
  edits: { date: string | undefined; time: string | undefined },
  saved: number | undefined,
  edge: "start" | "end",
): number | undefined => {
  if (edits.date === undefined && edits.time === undefined) return saved;
  const date = edits.date ?? (saved === undefined ? "" : toLocalDate(saved));
  const time = edits.time ?? (saved === undefined ? "" : toLocalTime(saved));
  return fromLocalFields(date, time, edge) ?? undefined;
};

// Ce qui part au gateway : l'état tel qu'il est, plus ce que le streamer a modifié. Le gateway le garde tel quel, sans refus.
export const settingOf = (
  state: CharityState | undefined,
  edits: Edits,
  isEnabled: boolean,
  isEventOnly: boolean = state?.isEventOnly === true,
): CharityEventSetting => {
  const startsAt = boundOf({ date: edits.startDate, time: edits.startTime }, state?.startsAt, "start");
  const endsAt = boundOf({ date: edits.endDate, time: edits.endTime }, state?.endsAt, "end");
  return {
    isEnabled,
    title: toCharityTitle(edits.title ?? state?.title ?? ""),
    address: (edits.address ?? state?.address ?? "").trim(),
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(endsAt === undefined ? {} : { endsAt }),
    ...(isEventOnly ? { isEventOnly } : {}),
  };
};

// Une validation sans rien de changé (le focus passe d'un champ à l'autre) n'envoie rien.
export const isSettingChanged = (state: CharityState | undefined, setting: CharityEventSetting): boolean =>
  setting.isEnabled !== (state?.isEnabled ?? false) ||
  setting.title !== (state?.title ?? "") ||
  setting.address !== (state?.address ?? "") ||
  setting.startsAt !== state?.startsAt ||
  setting.endsAt !== state?.endsAt ||
  (setting.isEventOnly === true) !== (state?.isEventOnly === true);

// Une fois le réglage enregistré, les champs repartent de l'état ; ce que le streamer a tapé depuis l'envoi reste.
export const withoutSaved = (current: Edits, sent: Edits): Edits => {
  const kept: Edits = {};
  for (const field of ["title", "address", "startDate", "startTime", "endDate", "endTime"] as const)
    if (current[field] !== undefined && current[field] !== sent[field]) kept[field] = current[field];
  return kept;
};

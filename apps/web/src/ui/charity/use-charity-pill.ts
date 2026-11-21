// Le titre de l'événement, sa 2e ligne et son lien, pour la pastille du haut de la fresque (CDC 2026, Mode événement) : tant que l'événement
// est activé, à venir, en cours ou terminé. La 2e ligne : le compte à rebours avant le début, « En cours » ensuite, puis le temps qui reste
// dans la dernière heure avant une fin, puis « Événement terminé » jusqu'au switch OFF. Le lien est la page de dons, quand l'adresse en est une. L'état se recalcule à l'horloge de la page.

import {
  charityAddressHref,
  charityCountdownOf,
  charityEndCountdownOf,
} from "@liveplace/domain/charity-event";
import type { CharityEventState } from "@liveplace/protocol";
import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { charityStatusOf } from "../../state/charity-event";
import type { Locale } from "../locale/locale";
import { useLocale, useTexts } from "../locale/use-locale";
import { CHARITY_TEXTS } from "./charity-texts";
import { formatCountdown } from "./charity-time";
import { useCharityClock } from "./use-charity-clock";

type Texts = (typeof CHARITY_TEXTS)[Locale];

const getServerView = (): undefined => undefined;

export type CharityPill = { title: string; line: string; href?: string | undefined; isRunning: boolean };

// Ce que dit la pastille à cet instant ; `undefined` : rien à montrer (désactivé ou inactif).
export const charityPillOf = (
  state: CharityEventState | undefined,
  nowMs: number,
  locale: Locale,
  t: Texts,
): CharityPill | undefined => {
  const status = charityStatusOf(state, nowMs);
  if (!state) return undefined;
  const href = state.address === undefined ? undefined : (charityAddressHref(state.address) ?? undefined);
  if (status.kind === "running") {
    const endCountdown = state.endsAt === undefined ? null : charityEndCountdownOf(state.endsAt - nowMs);
    const line = endCountdown ? t.endsIn(formatCountdown(endCountdown, locale)) : t.liveNow;
    return { title: state.title, line, href, isRunning: true };
  }
  if (status.kind === "ended") return { title: state.title, line: t.eventEnded, href, isRunning: false };
  if (status.kind !== "upcoming") return undefined;
  const countdown = formatCountdown(charityCountdownOf(status.startsAt - nowMs), locale);
  return { title: state.title, line: t.startsIn(countdown), href, isRunning: false };
};

export const useCharityPill = (canvas: CanvasStore | undefined): CharityPill | undefined => {
  const state = useSyncExternalStore(
    (listener) => (canvas ? canvas.subscribe(listener) : () => undefined),
    () => canvas?.getView().charityEvent?.state,
    getServerView,
  );
  const locale = useLocale();
  const t = useTexts(CHARITY_TEXTS);
  const nowMs = useCharityClock(state);
  return charityPillOf(state, nowMs, locale, t);
};

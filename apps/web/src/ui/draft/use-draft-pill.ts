// Ce que montre la pill Dessin, tiré des stores du canvas et du brouillon (JOURNAL 2026-09-24 : l'état d'un côté, l'affichage de l'autre).

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import type { DraftStore, DraftView } from "../../state/draft-store";
import { predictGauge } from "../../state/gauge";
import { signInHref } from "../account/auth-links";
import type { useSigningIn } from "../account/use-signing-in";
import type { GaugeProps } from "../design/gauge";
import { TOUCH_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import type { Locale } from "../locale/locale";
import { useLocale } from "../locale/use-locale";
import { msToNextSecond, waitSecondsOf } from "./draft-labels";
import type { DraftPillActions, DraftPillState } from "./draft-pill";
import { DRAFT_TEXTS } from "./draft-texts";

const formatCountdown = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export const submitDraft = (draftStore: DraftStore): void => {
  draftStore
    .submit()
    .catch((error: unknown) => console.error("draft-pill : envoi du brouillon interrompu", error));
};

// Une minuterie calée sur la seconde du compte à rebours, jamais `requestAnimationFrame` : le texte de l'infobulle et
// celui d'Attendre en dépendent (§9.4, Écart §9.3, JOURNAL 2026-10-08). Elle repart quand la jauge change d'échéance.
const useCountdownTick = (endsAt: number | undefined, setNowMs: (nowMs: number) => void): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNowMs(Date.now());
          schedule();
        },
        msToNextSecond(endsAt, Date.now()),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [endsAt, setNowMs]);
};

// Le client prédit, le serveur tranche : la jauge affichée entre deux réponses (§9.4).
const toGaugeProps = (
  canvas: CanvasView,
  draft: DraftView,
  nowMs: number,
  locale: Locale,
): GaugeProps | null => {
  const { gauge, params } = canvas;
  if (!gauge || !params) return null;
  const { charges, max, nextRefillAt, claimable } = predictGauge(gauge, params, nowMs);
  const reserved = draft.mode === "draft" ? draft.draft.size : 0;
  const refill = charges < max ? { endsAt: nextRefillAt, durationMs: params.refillMs } : null;
  return {
    charges,
    max,
    draft: reserved,
    refill,
    label: DRAFT_TEXTS[locale].gaugeLabel({
      charges,
      max,
      afterPlacement: reserved > 0 ? Math.max(0, charges - reserved) : undefined,
      nextRefill: refill
        ? { charges: params.refillCharges, countdown: formatCountdown(nextRefillAt - nowMs) }
        : undefined,
      claimable,
    }),
    shakeCount: draft.shakeCount,
  };
};

// Plus aucune charge et rien à poser : de quoi dire « Attendre 12 s » (Écart §9.3, JOURNAL 2026-10-08).
const toWaitSeconds = (gauge: GaugeProps | null, draftSize: number, nowMs: number): number | undefined =>
  gauge?.refill && gauge.charges === 0 && draftSize === 0
    ? waitSecondsOf(gauge.refill.endsAt - nowMs)
    : undefined;

const draftModeState = (
  canvas: CanvasView,
  draft: DraftView,
  gauge: GaugeProps,
  isTouchScreen: boolean,
  waitSeconds: number | undefined,
): Extract<DraftPillState, { kind: "draft" }> => {
  const isEditable = draft.draft.size > 0 && !draft.isSending;
  return {
    kind: "draft",
    gauge,
    palette: canvas.palette,
    colorIndex: draft.colorIndex,
    recentColorIndexes: draft.recentColorIndexes,
    isSending: draft.isSending,
    draftSize: draft.draft.size,
    canSubmit: isEditable,
    canDiscard: isEditable,
    isTouchScreen,
    isTouchTracing: draft.isTouchTracing,
    isPicking: draft.isPicking,
    ...(waitSeconds === undefined ? {} : { waitSeconds }),
    ...(canvas.lastError ? { refusal: canvas.lastError } : {}),
  };
};

type ShownDraftPillState = Exclude<DraftPillState, { kind: "reconnecting" }>;

// Ce que la pill montre quand la connexion est là, ou qu'on attend encore la première réponse.
const toShownState = (
  canvas: CanvasView,
  draft: DraftView,
  gauge: GaugeProps | null,
  login: string,
  isTouchScreen: boolean,
  waitSeconds: number | undefined,
): ShownDraftPillState => {
  if (canvas.status === "connecting" || canvas.status === "closed") return { kind: canvas.status };
  if (!canvas.userId) return { kind: "guest", signInHref: signInHref(login) };
  if (canvas.isBanned) return { kind: "banned" };
  // Un compte connecté reçoit sa jauge dans le `welcome` : sans elle, on attend encore.
  if (!gauge) return { kind: "connecting" };
  if (draft.mode === "view") {
    const canClaim = (canvas.gauge?.claimable ?? 0) > 0;
    return {
      kind: "view",
      gauge,
      canClaim,
      ...(canvas.lastError ? { refusal: canvas.lastError } : {}),
    };
  }
  return draftModeState(canvas, draft, gauge, isTouchScreen, waitSeconds);
};

// Pendant une reprise, la pill garde son contenu, flouté, et rien n'y répond (CDC 2026, Connexion et reconnexion).
export const toDraftPillState = (...shown: Parameters<typeof toShownState>): DraftPillState => {
  const state = toShownState(...shown);
  return shown[0].status === "reconnecting" ? { kind: "reconnecting", shown: state } : state;
};

type DraftPillStores = { canvas: CanvasStore; draft: DraftStore };

type SigningIn = ReturnType<typeof useSigningIn>;

export function useDraftPillProps(
  { canvas, draft }: DraftPillStores,
  login: string,
  { isSigningIn, onSignIn }: SigningIn,
): { state: DraftPillState; actions: DraftPillActions } {
  const canvasView = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const draftView = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  const isTouchScreen = useMediaQuery(TOUCH_SCREEN_QUERY);
  const locale = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const gauge = toGaugeProps(canvasView, draftView, nowMs, locale);
  useCountdownTick(gauge?.refill?.endsAt, setNowMs);
  const waitSeconds = toWaitSeconds(gauge, draftView.draft.size, nowMs);
  return {
    // Parti chez Twitch, la page perd sa connexion : la pill dit où elle va, jamais « Reconnexion ».
    state: isSigningIn
      ? { kind: "signingIn", signInHref: signInHref(login) }
      : toDraftPillState(canvasView, draftView, gauge, login, isTouchScreen, waitSeconds),
    actions: {
      onEnter: () => draft.enterDraftMode(),
      onClaim: () => canvas.claimGauge(),
      onExit: () => draft.exitDraftMode(),
      onSubmit: () => submitDraft(draft),
      onDiscard: () => draft.discardDraft(),
      onPickColor: (colorIndex) => draft.selectColor(colorIndex),
      onToggleEraser: () => draft.toggleEraser(),
      onTogglePicker: () => draft.togglePicker(),
      onToggleTouchTracing: () => draft.toggleTouchTracing(),
      onReload: () => window.location.reload(),
      onSignIn,
    },
  };
}

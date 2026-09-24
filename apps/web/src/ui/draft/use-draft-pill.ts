// Ce que montre la pill Dessin, tiré des stores du canvas et du brouillon (JOURNAL 2026-09-24 : l'état d'un côté, l'affichage de l'autre).

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import type { DraftStore, DraftView } from "../../state/draft-store";
import { predictGauge } from "../../state/gauge";
import { signInHref } from "../account/auth-links";
import type { GaugeProps } from "../design/gauge";
import { TOUCH_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import type { DraftPillActions, DraftPillState } from "./draft-pill";

const TICK_MS = 1000;

const formatCountdown = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export const submitDraft = (draftStore: DraftStore): void => {
  draftStore
    .submit()
    .catch((error: unknown) => console.error("draft-pill : envoi du brouillon interrompu", error));
};

// Un minuteur d'une seconde, jamais `requestAnimationFrame` : seul le texte de l'infobulle en dépend (§9.4).
const useNowMs = (): number => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
};

// Le client prédit, le serveur tranche : la jauge affichée entre deux réponses (§9.4).
const toGaugeProps = (canvas: CanvasView, draft: DraftView, nowMs: number): GaugeProps | null => {
  const { gauge, params } = canvas;
  if (!gauge || !params) return null;
  const { charges, max, nextRefillAt } = predictGauge(gauge, params, nowMs);
  const reserved = draft.mode === "draft" ? draft.draft.size : 0;
  const refill = charges < max ? { endsAt: nextRefillAt, durationMs: params.refillMs } : null;
  const afterPlacement = reserved > 0 ? `${Math.max(0, charges - reserved)} après la pose, ` : "";
  const nextCharge = refill
    ? `, +${params.refillCharges} dans ${formatCountdown(nextRefillAt - nowMs)}`
    : ", jauge pleine";
  return {
    charges,
    max,
    draft: reserved,
    refill,
    label: `${afterPlacement}${charges} / ${max} charges${nextCharge}`,
    shakeCount: draft.shakeCount,
  };
};

const draftModeState = (
  canvas: CanvasView,
  draft: DraftView,
  gauge: GaugeProps,
  isTouchScreen: boolean,
): DraftPillState => {
  const isEditable = draft.draft.size > 0 && !draft.isSending;
  return {
    kind: "draft",
    gauge,
    palette: canvas.palette,
    colorIndex: draft.colorIndex,
    recentColorIndexes: draft.recentColorIndexes,
    isSending: draft.isSending,
    canSubmit: isEditable,
    canDiscard: isEditable,
    isTouchScreen,
    isTouchTracing: draft.isTouchTracing,
    ...(canvas.lastError ? { refusal: canvas.lastError } : {}),
  };
};

const toDraftPillState = (
  canvas: CanvasView,
  draft: DraftView,
  gauge: GaugeProps | null,
  login: string,
  isTouchScreen: boolean,
): DraftPillState => {
  if (canvas.status !== "live") return { kind: canvas.status };
  if (!canvas.userId)
    return { kind: "guest", isSignInPrompted: draft.isSignInPrompted, signInHref: signInHref(login) };
  // Un compte connecté reçoit sa jauge dans le `welcome` : sans elle, on attend encore.
  if (!gauge) return { kind: "connecting" };
  if (draft.mode === "view")
    return { kind: "view", gauge, ...(canvas.lastError ? { refusal: canvas.lastError } : {}) };
  return draftModeState(canvas, draft, gauge, isTouchScreen);
};

type DraftPillStores = { canvas: CanvasStore; draft: DraftStore };

export function useDraftPillProps(
  { canvas, draft }: DraftPillStores,
  login: string,
): { state: DraftPillState; actions: DraftPillActions } {
  const canvasView = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const draftView = useSyncExternalStore(draft.subscribe, draft.getView, draft.getView);
  const isTouchScreen = useMediaQuery(TOUCH_SCREEN_QUERY);
  const nowMs = useNowMs();
  const gauge = toGaugeProps(canvasView, draftView, nowMs);
  return {
    state: toDraftPillState(canvasView, draftView, gauge, login, isTouchScreen),
    actions: {
      onEnter: () => draft.enterDraftMode(),
      onExit: () => draft.exitDraftMode(),
      onSubmit: () => submitDraft(draft),
      onDiscard: () => draft.discardDraft(),
      onPickColor: (colorIndex) => draft.selectColor(colorIndex),
      onPickRecentColor: (colorIndex) => draft.pickRecentColor(colorIndex),
      onToggleEraser: () => draft.toggleEraser(),
      onToggleTouchTracing: () => draft.toggleTouchTracing(),
      onReload: () => window.location.reload(),
    },
  };
}

// La jauge (CDC 2026, §9.4) : en Vue `12 / 20` et `+1 dans 0:42`, en Dessin `7 ← 12 / 20`, en trois segments.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { predictGauge } from "../../state/gauge";

const TICK_MS = 1000;
const SHAKE_MS = 300;
const SHAKE_KEYFRAMES = [0, -4, 4, -3, 3, 0].map((x) => ({ transform: `translateX(${x}px)` }));
const BAR_WIDTH = 120;
const SEGMENT_FILLS = {
  left: "#9de64e",
  draft: "rgba(157, 230, 78, 0.35)",
  empty: "rgba(255, 255, 255, 0.12)",
};

const formatCountdown = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const Segment = ({ share, color }: { share: number; color: string }) => (
  <span style={{ width: `${share * 100}%`, background: color }} />
);

type GaugeMeterProps = { store: CanvasStore; draftStore: DraftStore };

export const GaugeMeter = ({ store, draftStore }: GaugeMeterProps) => {
  const { gauge, params } = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const { mode, draft, shakeCount } = useSyncExternalStore(
    draftStore.subscribe,
    draftStore.getView,
    draftStore.getView,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const meter = useRef<HTMLSpanElement>(null);

  // Un minuteur d'une seconde, jamais `requestAnimationFrame` : le compte à rebours ne change qu'une fois par seconde.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // La jauge vibre quand le brouillon atteint le plafond (CDC 2026).
  useEffect(() => {
    if (shakeCount > 0) meter.current?.animate(SHAKE_KEYFRAMES, SHAKE_MS);
  }, [shakeCount]);

  if (!gauge || !params) return null;
  const { charges, max, nextRefillAt } = predictGauge(gauge, params, nowMs);
  const inDraft = mode === "draft" ? Math.min(draft.size, charges) : 0;
  const share = (count: number) => (max > 0 ? count / max : 0);
  const label =
    mode === "draft"
      ? `${Math.max(0, charges - draft.size)} ← ${charges} / ${max}`
      : `${charges} / ${max}${charges < max ? `   +${params.refillCharges} dans ${formatCountdown(nextRefillAt - nowMs)}` : ""}`;

  return (
    <span ref={meter} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{ display: "flex", width: BAR_WIDTH, height: 8, borderRadius: 4, overflow: "hidden" }}
        aria-hidden="true"
      >
        <Segment share={share(charges - inDraft)} color={SEGMENT_FILLS.left} />
        <Segment share={share(inDraft)} color={SEGMENT_FILLS.draft} />
        <Segment share={share(max - charges)} color={SEGMENT_FILLS.empty} />
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "pre" }}>{label}</span>
    </span>
  );
};

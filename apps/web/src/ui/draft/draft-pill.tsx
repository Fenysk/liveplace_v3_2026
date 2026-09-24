// La pill Dessin (CDC 2026), en bas au centre. Vue : la jauge et Dessiner. Dessin : la jauge, la palette, Valider, Annuler, Vider.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { type CSSProperties, type MouseEvent, useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { Pill } from "../design/pill";
import { GaugeMeter } from "../gauge/gauge-meter";

const BUTTON_STYLE: CSSProperties = {
  padding: "6px 12px",
  border: "none",
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.12)",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};
const PRIMARY_STYLE: CSSProperties = { ...BUTTON_STYLE, background: "#3388de" };
const SWATCH_SIZE = 22;
// La gomme se distingue des couleurs : un damier barré (CDC 2026).
const ERASER_BACKGROUND =
  "linear-gradient(135deg, transparent 45%, #ec273f 45%, #ec273f 55%, transparent 55%), repeating-conic-gradient(#d6d6dc 0% 25%, #c2c2ca 0% 50%) 0 0 / 8px 8px";
const LINK_STYLE = { color: "#c9b6ff" };
const STATUS_LABELS = { connecting: "Connexion…", closed: "Déconnecté · recharge la page" } as const;

// Un bouton rend le focus après un clic : sinon Espace et Entrée le recliqueraient au lieu de tracer ou de valider.
const pressed = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.blur();
  action();
};

export const submitDraft = (draftStore: DraftStore): void => {
  draftStore
    .submit()
    .catch((error: unknown) => console.error("draft-pill : envoi du brouillon interrompu", error));
};

// Lu dans un `useEffect` : `matchMedia` n'existe pas sur le serveur.
const useTouchScreen = (): boolean => {
  const [isTouchScreen, setIsTouchScreen] = useState(false);
  useEffect(() => setIsTouchScreen(window.matchMedia("(any-pointer: coarse)").matches), []);
  return isTouchScreen;
};

type PaletteProps = { palette: readonly string[]; colorIndex: number; draftStore: DraftStore };

// L'ordre de la palette est celui du CDC 2026, la gomme (index 0) en tête.
const PaletteSwatches = ({ palette, colorIndex, draftStore }: PaletteProps) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
    {palette.map((color, index) => (
      <button
        key={color}
        type="button"
        aria-label={index === TRANSPARENT_COLOR_INDEX ? "Gomme (E)" : `Couleur ${color}`}
        aria-pressed={index === colorIndex}
        onClick={pressed(() => draftStore.selectColor(index))}
        style={{
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
          padding: 0,
          borderRadius: 6,
          border: `2px solid ${index === colorIndex ? "#ffffff" : "rgba(255, 255, 255, 0.15)"}`,
          background: index === TRANSPARENT_COLOR_INDEX ? ERASER_BACKGROUND : color,
          cursor: "pointer",
        }}
      />
    ))}
  </div>
);

type DraftPillProps = { store: CanvasStore; draftStore: DraftStore; login: string };

export const DraftPill = ({ store, draftStore, login }: DraftPillProps) => {
  const canvasView = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const draftView = useSyncExternalStore(draftStore.subscribe, draftStore.getView, draftStore.getView);
  const isTouchScreen = useTouchScreen();

  if (canvasView.status !== "live") return <Pill dock="bc">{STATUS_LABELS[canvasView.status]}</Pill>;

  // Écart §10.1 (JOURNAL 2026-09-22) : après Twitch, on revient sur ce canvas.
  if (!canvasView.userId)
    return (
      <Pill dock="bc">
        <a href={`/auth/twitch?returnTo=${encodeURIComponent(`/${login}`)}`} style={LINK_STYLE}>
          Se connecter pour dessiner
        </a>
      </Pill>
    );

  const gauge = <GaugeMeter store={store} draftStore={draftStore} />;
  const refusal = canvasView.lastError && (
    <span style={{ fontSize: 12, color: "#fa6e79" }}>Refusé : {canvasView.lastError}</span>
  );

  if (draftView.mode === "view")
    return (
      <Pill dock="bc">
        {gauge}
        <button type="button" style={PRIMARY_STYLE} onClick={pressed(() => draftStore.enterDraftMode())}>
          Dessiner
        </button>
        {refusal}
      </Pill>
    );

  const canSubmit = draftView.draft.size > 0 && !draftView.isSending;
  return (
    <Pill dock="bc" layout="stack">
      {/* Pendant l'envoi, le mode Dessin reste affiché mais verrouillé (CDC 2026). */}
      <div
        style={{
          display: "grid",
          gap: 8,
          justifyItems: "center",
          opacity: draftView.isSending ? 0.5 : 1,
          pointerEvents: draftView.isSending ? "none" : "auto",
        }}
      >
        {gauge}
        <PaletteSwatches
          palette={canvasView.palette}
          colorIndex={draftView.colorIndex}
          draftStore={draftStore}
        />
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
          <button
            type="button"
            style={{ ...PRIMARY_STYLE, opacity: canSubmit ? 1 : 0.4 }}
            disabled={!canSubmit}
            onClick={pressed(() => submitDraft(draftStore))}
          >
            Valider
          </button>
          <button type="button" style={BUTTON_STYLE} onClick={pressed(() => draftStore.exitDraftMode())}>
            Annuler
          </button>
          <button type="button" style={BUTTON_STYLE} onClick={pressed(() => draftStore.discardDraft())}>
            Vider
          </button>
          {isTouchScreen && (
            <button
              type="button"
              aria-pressed={draftView.isTouchTracing}
              style={{
                ...BUTTON_STYLE,
                ...(draftView.isTouchTracing ? { background: "#9de64e", color: "#10121c" } : {}),
              }}
              onClick={pressed(() => draftStore.toggleTouchTracing())}
            >
              Tracé
            </button>
          )}
        </div>
        {refusal}
      </div>
    </Pill>
  );
};

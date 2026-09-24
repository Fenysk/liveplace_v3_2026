// La pill Inspection (CDC 2026), au centre à droite : l'auteur du pixel inspecté, la date de pose, la couleur.
// Visible seulement pendant une inspection, en mode Vue. Les boutons de modération arrivent au J11.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import type { InspectEntry } from "@liveplace/domain/ports";
import { type CSSProperties, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { Pill } from "../pill/pill";

const AVATAR_SIZE = 40;
const AVATAR_STYLE: CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  background: "#5e5b8c",
  fontWeight: 700,
  objectFit: "cover",
};
const CLOSE_STYLE: CSSProperties = {
  position: "absolute",
  top: 4,
  right: 8,
  border: "none",
  background: "transparent",
  color: "inherit",
  fontSize: 18,
  cursor: "pointer",
};
const PLACED_AT_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

// Sans avatar (auteur pas reconnecté depuis l'écart du JOURNAL 2026-09-24) : son initiale.
const Avatar = ({ entry }: { entry: InspectEntry }) =>
  entry.avatarUrl ? (
    <img src={entry.avatarUrl} alt="" style={AVATAR_STYLE} />
  ) : (
    <span style={AVATAR_STYLE} aria-hidden="true">
      {entry.displayName.slice(0, 1).toUpperCase()}
    </span>
  );

const Author = ({ entry, palette }: { entry: InspectEntry; palette: readonly string[] }) => {
  const color = palette[entry.colorIndex];
  const isTransparent = entry.colorIndex === TRANSPARENT_COLOR_INDEX;
  return (
    <div style={{ display: "grid", gap: 6, paddingRight: 16 }}>
      {/* L'avatar et le nom ouvrent sa chaîne Twitch dans un nouvel onglet (CDC 2026). */}
      <a
        href={`https://www.twitch.tv/${encodeURIComponent(entry.login)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", gap: 10, color: "#c9b6ff" }}
      >
        <Avatar entry={entry} />
        <strong>{entry.displayName}</strong>
      </a>
      <span style={{ fontSize: 13, opacity: 0.8 }}>Posé le {PLACED_AT_FORMAT.format(entry.placedAt)}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: isTransparent ? "transparent" : color,
          }}
        />
        {isTransparent ? "Transparent (gomme)" : color}
      </span>
    </div>
  );
};

type InspectionPillProps = { store: CanvasStore; draftStore: DraftStore };

export const InspectionPill = ({ store, draftStore }: InspectionPillProps) => {
  const { inspection, palette } = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const { mode } = useSyncExternalStore(draftStore.subscribe, draftStore.getView, draftStore.getView);
  if (!inspection || mode !== "view") return null;
  return (
    <Pill anchor="centerRight" direction="panel">
      <div style={{ position: "relative", minWidth: 180, whiteSpace: "normal" }}>
        <button type="button" aria-label="Fermer" style={CLOSE_STYLE} onClick={() => store.closeInspection()}>
          ×
        </button>
        <span style={{ display: "block", fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
          Case {inspection.x}, {inspection.y}
        </span>
        {inspection.status === "loading" && <span>…</span>}
        {inspection.status === "empty" && <span>Personne n'a encore posé ici</span>}
        {inspection.status === "found" && <Author entry={inspection.entry} palette={palette} />}
      </div>
    </Pill>
  );
};

// Les morceaux d'interface des vignettes « Signaler un dessin » et « Efface les dessins gênants », à l'échelle d'une vignette : la pill
// Inspection (l'auteur, la case, son bouton), la petite fenêtre qui demande confirmation, et le toast. Les classes et les phrases sont
// celles du jeu (inspection-pill.tsx, moderation-window.tsx, toast.tsx) ; ce ne sont que des `<span>`, la vignette est déjà un bouton.

import { PALETTE } from "@liveplace/domain";
import { Check, CircleAlert, CircleCheck, Flag, X } from "lucide-react";
import type { ReactNode } from "react";
import { DESIGN_TEXTS } from "../design/design-texts";
import { Avatar } from "../design/profile";
import { INSPECTION_TEXTS } from "../inspection/inspection-texts";
import { useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import type { InspectionKind, InspectionMoment } from "./inspection-motion";
import {
  CAT_AT,
  CAT_LAYERS,
  INSPECTED_CELL,
  MUSHROOM_AT,
  MUSHROOM_LAYERS,
  SCRIBBLE_AT,
  SCRIBBLE_LAYERS,
} from "./inspection-scene";
import { PillButton, PillTool } from "./pill-tool";
import { ArtAt, CELL, CellOutline } from "./scene-art";

// Un pseudo inventé, comme ceux du classement, et la case qu'il a posée.
export const AUTHOR = "Kira";
const COORDINATES = "(12, 9)";
const SCRIBBLE_COLOR_INDEX = 33;

// La mini-fresque : deux petits motifs, le gribouillis et le contour de la case inspectée.
export const InspectionArt = ({ resting }: { resting: InspectionMoment }) => (
  <>
    <ArtAt layers={MUSHROOM_LAYERS} x={MUSHROOM_AT.x} y={MUSHROOM_AT.y} />
    <ArtAt layers={CAT_LAYERS} x={CAT_AT.x} y={CAT_AT.y} />
    <g data-part="scribble" opacity={resting.scribble}>
      <ArtAt layers={SCRIBBLE_LAYERS} x={SCRIBBLE_AT.x} y={SCRIBBLE_AT.y} />
    </g>
    <g data-part="ring" opacity={resting.ring}>
      <CellOutline x={SCRIBBLE_AT.x + INSPECTED_CELL.x * CELL} y={SCRIBBLE_AT.y + INSPECTED_CELL.y * CELL} />
    </g>
  </>
);

// Le voile que pose une fenêtre de confirmation sur toute la scène (son opacité suit `--lp-release-window`).
export const WindowVeil = () => <span className="lp-release-veil" aria-hidden="true" />;

// Le haut de la pill Inspection : l'auteur (et, après lui, ce que `twitch` ajoute à son profil : le bouton Twitch) et Fermer, puis la case
// (sa couleur, ses coordonnées, sa date en barre).
export const InspectionHead = ({ colorIndex, twitch }: { colorIndex: number; twitch?: ReactNode }) => (
  <>
    <span className="lp-row">
      <span className="lp-profile">
        <span className="lp-profile-main">
          <Avatar displayName={AUTHOR} />
          <span className="lp-profile-name lp-type-body">{AUTHOR}</span>
        </span>
        {twitch}
      </span>
      <span className="lp-spacer" />
      <PillTool icon={X} />
    </span>
    <span className="lp-row lp-prompt">
      <span className="lp-color-chip">
        <svg className="lp-release-chip-dot" viewBox="0 0 1 1" aria-hidden="true">
          <rect width={1} height={1} fill={PALETTE[colorIndex]} />
        </svg>
        <span className="lp-type-numeric">{COORDINATES}</span>
      </span>
      <span className="lp-skeleton lp-release-bar" />
    </span>
  </>
);

// La pill Inspection de Signaler et d'Effacer : le haut, puis sous un filet le bouton de l'action. Signaler : le bouton se grise et dit
// « Signalé » une fois fait. Effacer ses dessins : il est seul sur sa rangée.
export const InspectionPillMini = ({ kind }: { kind: InspectionKind }) => {
  const t = useTexts(INSPECTION_TEXTS);
  return (
    <span className="lp-pill lp-release-pill lp-release-inspection lp-release-pill--center-right">
      <span className="lp-pill-content lp-col">
        <InspectionHead colorIndex={SCRIBBLE_COLOR_INDEX} />
        <span className="lp-row lp-row--ruled">
          {kind === "report" ? (
            <>
              <PillButton icon={Flag} label={t.report} tap="row" className="lp-release-report" />
              <PillButton icon={Check} label={t.reported} className="lp-release-reported" />
            </>
          ) : (
            <PillButton label={t.clearTheirPixels} tap="row" />
          )}
        </span>
      </span>
    </span>
  );
};

// La fenêtre de confirmation, au centre : sa question, puis Annuler et le bouton de l'action (primaire pour Signaler, danger pour Effacer).
export const ConfirmWindowMini = ({ kind }: { kind: InspectionKind }) => {
  const t = useTexts(MODERATION_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const isReport = kind === "report";
  const request = { name: AUTHOR, isSingle: true };
  return (
    <span className="lp-pill lp-release-pill lp-release-confirm">
      <span className="lp-pill-content lp-col">
        <span className="lp-type-body lp-release-confirm-title">
          {isReport ? t.reportTitle(request) : t.clearTitle(request)}
        </span>
        <span className="lp-row lp-release-confirm-actions">
          <PillButton label={design.cancel} />
          <PillButton
            label={isReport ? t.report : t.clear}
            variant={isReport ? "primary" : "danger"}
            tap="confirm"
          />
        </span>
      </span>
    </span>
  );
};

// Le toast de succès, en bas à gauche : l'icône et la phrase.
export const ToastMini = ({ message, tone = "success" }: { message: string; tone?: "success" | "error" }) => (
  <span className="lp-pill lp-release-pill lp-release-toast">
    <span className="lp-pill-content">
      <span className={`lp-toast lp-toast--${tone} lp-type-body`}>
        {tone === "success" ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        {message}
      </span>
    </span>
  </span>
);

export const ReportToastMini = () => {
  const t = useTexts(MODERATION_TEXTS);
  return <ToastMini message={t.reportSent} />;
};

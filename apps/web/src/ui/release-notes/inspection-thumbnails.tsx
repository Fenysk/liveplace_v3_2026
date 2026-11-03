// « Signaler un dessin » et « Efface les dessins gênants » : la pill Inspection, sa fenêtre de confirmation et le toast, en petit sur une
// mini-fresque, avec une souris (inspection-motion.ts). L'image fixe : Signaler a abouti (le bouton dit « Signalé », le toast paraît) ;
// Effacer a abouti (le gribouillis est parti, l'Inspection reste ouverte). Sans souris.

import { useRef } from "react";
import { CLEAR_RESTING_MS, type InspectionKind, inspectionAt, REPORT_RESTING_MS } from "./inspection-motion";
import {
  ConfirmWindowMini,
  InspectionArt,
  InspectionPillMini,
  ReportToastMini,
  WindowVeil,
} from "./inspection-parts";
import { MiniCanvas } from "./mini-canvas";
import { Pointer, setPartOpacity, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

// Chaque image : les parties du dessin par leur opacité, la pill, la fenêtre et le toast par des variables, les boutons par leur appui.
const renderInspection = (host: HTMLElement, timeMs: number, kind: InspectionKind): void => {
  const moment = inspectionAt(kind, timeMs);
  setPartOpacity(host, "scribble", moment.scribble);
  setPartOpacity(host, "ring", moment.ring);
  setThumbnailVariable(host, "--lp-release-pill", moment.pill);
  setThumbnailVariable(host, "--lp-release-window", moment.window);
  setThumbnailVariable(host, "--lp-release-toast", moment.toast);
  host.dataset.done = String(moment.isDone);
  setTaps(host, { row: moment.rowTap, confirm: moment.confirmTap });
  setPointer(host, moment.pointer, moment.press);
};

const renderReport = (host: HTMLElement, timeMs: number): void => renderInspection(host, timeMs, "report");
const renderClear = (host: HTMLElement, timeMs: number): void => renderInspection(host, timeMs, "clear");

export const ReportThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderReport, REPORT_RESTING_MS);
  const resting = inspectionAt("report", REPORT_RESTING_MS);
  return (
    <span
      ref={host}
      className="lp-release-scene lp-release-text-scene lp-release-report-scene"
      data-done={String(resting.isDone)}
    >
      <MiniCanvas layers={[]}>
        <InspectionArt resting={resting} />
      </MiniCanvas>
      <InspectionPillMini kind="report" />
      <WindowVeil />
      <ConfirmWindowMini kind="report" />
      <ReportToastMini />
      <Pointer />
    </span>
  );
};

export const ClearThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderClear, CLEAR_RESTING_MS);
  const resting = inspectionAt("clear", CLEAR_RESTING_MS);
  return (
    <span
      ref={host}
      className="lp-release-scene lp-release-text-scene lp-release-clear-scene"
      data-done="false"
    >
      <MiniCanvas layers={[]}>
        <InspectionArt resting={resting} />
      </MiniCanvas>
      <InspectionPillMini kind="clear" />
      <WindowVeil />
      <ConfirmWindowMini kind="clear" />
      <Pointer />
    </span>
  );
};

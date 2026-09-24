// La pill Inspection (CDC 2026), au centre à droite : l'auteur du pixel inspecté, sa couleur, sa date de pose.
// L'affichage seul, nourri par `useInspectionPillProps`. La modération arrive au J11.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Inspection } from "../../state/canvas-store";
import { Button } from "../design/button";
import { ColorChip } from "../design/palette";
import { Pill, type PillDock } from "../design/pill";
import { Profile } from "../design/profile";
import { formatPlacedAgo } from "./placed-ago";

const DOCK: PillDock = "cr";
const PLACED_AT_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

export type InspectionPillProps = {
  inspection: Inspection | null;
  palette: readonly string[];
  nowMs: number; // pour la date relative
  onClose: () => void;
  isDocked?: boolean;
};

const CloseButton = ({ onClose }: Pick<InspectionPillProps, "onClose">) => (
  <Button icon={X} variant="ghost" title="Fermer (Échap)" onPress={onClose} />
);

type InspectedCellProps = Pick<InspectionPillProps, "palette" | "nowMs" | "onClose"> & {
  inspection: Exclude<Inspection, { status: "loading" }>;
};

const InspectedCell = ({ inspection, palette, nowMs, onClose }: InspectedCellProps) => {
  const coordinates = `(${inspection.x}, ${inspection.y})`;
  if (inspection.status === "empty")
    return (
      <>
        <div className="lp-row">
          <span className="lp-type-body lp-prompt">Personne n'a encore posé ici</span>
          <span className="lp-spacer" />
          <CloseButton onClose={onClose} />
        </div>
        <span className="lp-type-caption lp-muted lp-prompt">{coordinates}</span>
      </>
    );
  const { entry } = inspection;
  const color = entry.colorIndex === TRANSPARENT_COLOR_INDEX ? undefined : palette[entry.colorIndex];
  return (
    <>
      <div className="lp-row">
        <Profile user={entry} variant="full" />
        <span className="lp-spacer" />
        <CloseButton onClose={onClose} />
      </div>
      <div className="lp-row lp-prompt">
        <ColorChip {...(color ? { color } : {})}>
          <span className="lp-type-numeric" title={color ?? "Transparent (gomme)"}>
            {coordinates}
          </span>
        </ColorChip>
        <span
          className="lp-type-caption lp-muted"
          title={`Posé le ${PLACED_AT_FORMAT.format(entry.placedAt)}`}
        >
          {formatPlacedAgo(entry.placedAt, nowMs)}
        </span>
      </div>
    </>
  );
};

type ShownInspection = Exclude<Inspection, { status: "loading" }>;

const toShown = (inspection: Inspection | null): ShownInspection | null =>
  inspection && inspection.status !== "loading" ? inspection : null;

// La pill garde la dernière case montrée : elle s'efface avec elle à la fermeture, et une autre case la remplace
// par un morphing sans qu'elle disparaisse (maquette). À la première ouverture, elle attend la réponse, masquée.
const useShownInspection = (inspection: Inspection | null) => {
  const current = toShown(inspection);
  const [lastShown, setLastShown] = useState<ShownInspection | null>(current);
  const wasVisible = useRef(false);
  const isVisible = inspection !== null && (current !== null || wasVisible.current);
  useEffect(() => {
    wasVisible.current = isVisible;
    if (current) setLastShown(current);
  }, [isVisible, current]);
  return { shown: current ?? lastShown, isVisible };
};

export const InspectionPill = ({
  inspection,
  palette,
  nowMs,
  onClose,
  isDocked = true,
}: InspectionPillProps) => {
  const { shown, isVisible } = useShownInspection(inspection);
  if (!inspection && !shown) return null;
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="stack" isVisible={isVisible}>
      {shown && <InspectedCell inspection={shown} palette={palette} nowMs={nowMs} onClose={onClose} />}
    </Pill>
  );
};

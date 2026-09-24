// La pill Pratique (CDC 2026), en bas à droite : de haut en bas, zoomer, le pourcentage, dézoomer, recentrer.
// Sur mobile, recentrer seul, et seulement quand la vue a bougé.

import { LocateFixed, Minus, Plus } from "lucide-react";
import { Button } from "../design/button";
import { Pill, type PillDock, PillSeparator } from "../design/pill";
import type { Framing } from "./viewport";

const DOCK: PillDock = "br";

type ViewportPillProps = {
  framing: Framing | null; // `null` : le canvas n'est pas encore cadré
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  isCompact?: boolean;
  isSheetOpen?: boolean; // sur mobile, une seule feuille à la fois : la feuille Dessin ou l'inspection
  isDocked?: boolean;
};

export const ViewportPill = ({
  framing,
  onZoomIn,
  onZoomOut,
  onRecenter,
  isCompact = false,
  isSheetOpen = false,
  isDocked = true,
}: ViewportPillProps) => {
  const dock = isDocked ? DOCK : undefined;
  const recenter = (
    <Button icon={LocateFixed} variant="ghost" title="Recentrer la vue" onPress={onRecenter} />
  );
  if (isCompact)
    return (
      <Pill dock={dock} isVisible={framing !== null && !framing.isArrival && !isSheetOpen}>
        {recenter}
      </Pill>
    );
  return (
    <Pill dock={dock} layout="rail">
      <Button icon={Plus} variant="ghost" title="Zoomer" onPress={onZoomIn} />
      <span className="lp-zoom lp-type-numeric" aria-live="polite">
        {/* À quatre chiffres, sans espace : il tient dans la largeur d'un contrôle. */}
        {framing && (framing.zoomPercent < 1000 ? `${framing.zoomPercent} %` : `${framing.zoomPercent}%`)}
      </span>
      <Button icon={Minus} variant="ghost" title="Dézoomer" onPress={onZoomOut} />
      <PillSeparator />
      {recenter}
    </Pill>
  );
};

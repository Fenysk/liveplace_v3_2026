// Les curseurs de la fresque à la souris (Écart §9.3, JOURNAL 2026-10-13) : un par situation, les vrais, posés par le CSSOM
// comme le fait la scène. Passer la souris sur la zone les montre ; l'image de l'outil est montrée en grand à côté.

import { useEffect, useRef, useState } from "react";
import {
  type CursorKind,
  type CursorShades,
  cursorOf,
  TOOL_ICONS,
  toolCursorSvg,
} from "../canvas/canvas-cursor";
import { getSceneShades } from "../canvas/scene-shades";
import { Block, StateRow } from "./entry-layout";

const SITUATIONS: readonly { name: string; detail: string; kind: CursorKind }[] = [
  { name: "Vue, le clic inspecte", detail: "La croix.", kind: "inspect" },
  {
    name: "Vue, case trop petite",
    detail: "La loupe : le clic zoome au lieu d'inspecter (case sous 10 px à la souris).",
    kind: "zoom",
  },
  {
    name: "La vue se déplace",
    detail: "La main fermée, en Vue comme en Dessin, avant tout outil.",
    kind: "grabbing",
  },
  { name: "Dessin, une couleur", detail: "La croix.", kind: "draw" },
  { name: "Dessin, la gomme", detail: "L'icône du bouton Gomme.", kind: "eraser" },
  { name: "Dessin, la pipette", detail: "L'icône du bouton Pipette.", kind: "picker" },
  {
    name: "Dessin, Espace maintenu",
    detail: "L'icône du bouton Tracé, avant la gomme : le geste est le tracé.",
    kind: "trace",
  },
];

// Les teintes du contour, lues dans tokens.css comme le fait la scène, puis le curseur par le CSSOM, pas un attribut `style` :
// la CSP de prod bloque celui qu'un serveur rend. Avant la lecture, la zone n'a pas encore de curseur d'outil.
const CursorZone = ({ kind }: { kind: CursorKind }) => {
  const zone = useRef<HTMLDivElement>(null);
  const [shades, setShades] = useState<CursorShades | null>(null);
  useEffect(() => {
    const { outlineOut, outlineIn } = getSceneShades(document.documentElement);
    setShades({ ink: outlineOut, halo: outlineIn });
  }, []);
  useEffect(() => {
    if (zone.current && shades) zone.current.style.cursor = cursorOf(kind, shades);
  }, [kind, shades]);
  const icon = kind === "eraser" || kind === "picker" || kind === "trace" ? TOOL_ICONS[kind] : null;
  return (
    <div ref={zone} className="design-cursor-zone lp-type-caption lp-muted">
      {icon && shades && (
        <img
          className="design-cursor-image"
          alt=""
          src={`data:image/svg+xml,${encodeURIComponent(toolCursorSvg(icon, shades))}`}
        />
      )}
      {!icon && shades && <code>{cursorOf(kind, shades)}</code>}
    </div>
  );
};

export const CursorBlock = () => (
  <Block
    title="Curseur sur la fresque"
    note="À la souris seulement : le curseur dit ce que fera le clic, et un outil a l'icône de son bouton, au contour clair pour se lire sur un fond clair comme foncé. Au doigt, rien ne change."
  >
    {SITUATIONS.map(({ name, detail, kind }) => (
      <StateRow key={name} name={name} detail={detail} isDemo>
        <CursorZone kind={kind} />
      </StateRow>
    ))}
  </Block>
);

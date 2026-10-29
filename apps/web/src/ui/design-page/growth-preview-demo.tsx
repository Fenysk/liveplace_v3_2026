// L'aperçu de la croissance (Écart §9.3, JOURNAL 2026-10-29), tel que le jeu le montre : les vraies couches (`GrowthPreview`) et la vraie
// règle (`previewGrowth`, `createGrowthPreview`), sur une fresque de 10 × 10 dans une boîte au lieu de l'écran. Passer la souris sur la
// fresque la fait viser une case, comme en Dessin ; une case de la marge montre ce qui s'ajoute, une case du milieu ne montre rien.

import { useEffect, useRef, useState } from "react";
import { createGrowthPreview, previewGrowth } from "../canvas/growth-preview";
import { GrowthPreview } from "../canvas/growth-preview-layers";
import { type Cell, frameBox, insetOf, type Viewport } from "../canvas/viewport";
import { classNames } from "../design/class-names";

const CANVAS = { width: 10, height: 10 };
const STAGE = { width: 320, height: 256 };
// Les mêmes nombres que `.design-preview-cells` dans design-page.css : la fresque, à 16 px la case, à 3 cases de chaque bord au moins.
const VIEWPORT: Viewport = { scale: 16, offsetX: 80, offsetY: 48 };
const COLOR_INDEX = 5;
const NO_DRAFT: readonly Cell[] = [];

type Props = { initialAim?: Cell | null; draft?: readonly Cell[]; isInteractive?: boolean };

export const GrowthPreviewDemo = ({ initialAim = null, draft = NO_DRAFT, isInteractive = true }: Props) => {
  const [aim, setAim] = useState<Cell | null>(initialAim);
  const stage = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const checker = useRef<HTMLDivElement>(null);
  const tiles = useRef<HTMLDivElement>(null);
  const outline = useRef<SVGRectElement>(null);
  const show = useRef<ReturnType<typeof createGrowthPreview>>(undefined);

  // Le damier de la fresque d'aujourd'hui, découpé à elle comme dans le jeu ; puis l'aperçu, qui s'écrit dans ses couches.
  useEffect(() => {
    if (!current.current || !root.current || !checker.current || !outline.current) return;
    current.current.style.setProperty("--lp-checker-clip", insetOf(frameBox(VIEWPORT, CANVAS), STAGE));
    show.current = createGrowthPreview({
      root: root.current,
      checker: checker.current,
      outline: outline.current,
    });
  }, []);

  useEffect(() => {
    const growth = previewGrowth({
      isDynamicSize: true,
      mode: "draft",
      draft: draft.map((cell) => ({ ...cell, colorIndex: COLOR_INDEX })),
      aimedCell: aim,
      colorIndex: COLOR_INDEX,
      isPicking: false,
      canvas: CANVAS,
    });
    show.current?.(growth ? frameBox(VIEWPORT, CANVAS, growth) : null, STAGE);
  }, [aim, draft]);

  const aimAt = (clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.floor((clientX - box.left - VIEWPORT.offsetX) / VIEWPORT.scale);
    const y = Math.floor((clientY - box.top - VIEWPORT.offsetY) / VIEWPORT.scale);
    const isInside = x >= 0 && y >= 0 && x < CANVAS.width && y < CANVAS.height;
    setAim(isInside ? { x, y } : null);
  };

  return (
    <div
      ref={stage}
      className="design-preview-stage"
      onPointerMove={isInteractive ? (event) => aimAt(event.clientX, event.clientY) : undefined}
      onPointerLeave={isInteractive ? () => setAim(null) : undefined}
    >
      <div ref={current} className="lp-checker design-preview-current" aria-hidden="true">
        <div className="lp-checker-tiles" />
      </div>
      <GrowthPreview refs={{ root, checker, tiles, outline }} isContained />
      <div className="design-preview-cells" aria-hidden="true">
        {Array.from({ length: CANVAS.width * CANVAS.height }, (_, index) => {
          const x = index % CANVAS.width;
          const y = Math.floor(index / CANVAS.width);
          return (
            <span
              key={`${x},${y}`}
              className={classNames(
                "design-preview-cell",
                draft.some((cell) => cell.x === x && cell.y === y) && "is-draft",
                aim?.x === x && aim.y === y && "is-aimed",
              )}
            />
          );
        })}
      </div>
    </div>
  );
};

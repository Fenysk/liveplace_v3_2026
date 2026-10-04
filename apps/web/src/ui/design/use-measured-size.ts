// Pose sur `<html>` la taille mesurée d'un élément, tant qu'il est actif : le CSS qui en dépend (canvas.css, pill.css) la lit.

import { type RefObject, useEffect } from "react";

type MeasuredSize = { cssVar: string | null; dimension: "width" | "height"; isActive: boolean };

export function useMeasuredSize(
  element: RefObject<HTMLElement | null>,
  { cssVar, dimension, isActive }: MeasuredSize,
) {
  useEffect(() => {
    const root = document.documentElement;
    const measured = element.current;
    if (!cssVar || !measured || !isActive) {
      if (cssVar) root.style.removeProperty(cssVar);
      return;
    }
    const measure = () =>
      root.style.setProperty(
        cssVar,
        `${dimension === "width" ? measured.offsetWidth : measured.offsetHeight}px`,
      );
    // Mesuré tout de suite : l'observateur ne rend la main qu'au prochain affichage, et la vue ne doit pas attendre.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(measured);
    return () => {
      observer.disconnect();
      root.style.removeProperty(cssVar);
    };
  }, [element, cssVar, dimension, isActive]);
}

// La section que le visiteur lit, pour le sommaire : un IntersectionObserver prévient quand un haut de section passe la ligne (le quart
// haut de la fenêtre), un second quand le repère du bas de la page paraît ; c'est alors seulement qu'on mesure. Aucun écouteur de défilement.

import { useEffect, useState } from "react";
import { currentSectionId } from "./current-section";

const LINE_PERCENT = 25;
const SEPARATOR = " ";

export const useCurrentSection = (ids: readonly string[], endId: string): string => {
  const key = ids.join(SEPARATOR);
  const [currentId, setCurrentId] = useState(ids[0] ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = key.split(SEPARATOR).flatMap((id) => {
      const element = document.getElementById(id);
      return element ? [{ id, element }] : [];
    });
    const end = document.getElementById(endId);
    const measure = () => {
      const line = (window.innerHeight * LINE_PERCENT) / 100;
      const tops = sections.map(({ id, element }) => ({ id, top: element.getBoundingClientRect().top }));
      // Une page qui n'a pas défilé n'est pas « au bas » : une page courte garde sa première section
      const isAtEnd =
        window.scrollY > 0 && end !== null && end.getBoundingClientRect().top <= window.innerHeight;
      setCurrentId(currentSectionId(tops, line, isAtEnd));
    };
    // Le haut de la fenêtre jusqu'à la ligne : une section y entre ou en sort quand son haut passe la ligne
    const lineObserver = new IntersectionObserver(measure, {
      rootMargin: `0px 0px -${100 - LINE_PERCENT}% 0px`,
    });
    const endObserver = new IntersectionObserver(measure);
    for (const { element } of sections) lineObserver.observe(element);
    if (end) endObserver.observe(end);
    return () => {
      lineObserver.disconnect();
      endObserver.disconnect();
    };
  }, [key, endId]);
  return currentId;
};

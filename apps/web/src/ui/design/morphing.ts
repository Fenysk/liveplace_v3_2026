// Un élément dont la taille glisse (Écart §9.3, JOURNAL 2026-10-08) : la pill qui l'entoure suit sa taille d'elle-même, elle ne la
// rejoue pas à chaque image (use-morph.ts). Le bouton au libellé qui change et le contrôle qui paraît le portent le temps de glisser.

export const MORPHING_ATTRIBUTE = "data-morphing";

export const markMorphing = (element: Element): void => element.setAttribute(MORPHING_ATTRIBUTE, "");

// Après l'image où la pill mesure la taille finale : libérer plus tôt la ferait la rejouer d'un pixel.
export const releaseMorphing = (element: Element, isMorphing: (animation: Animation) => boolean): void => {
  setTimeout(() => {
    if (!element.getAnimations().some(isMorphing)) element.removeAttribute(MORPHING_ATTRIBUTE);
  });
};

// `selector` : de quoi retrouver un élément qui glisse dans le contenu d'une pill.
export const MORPHING_SELECTOR = `[${MORPHING_ATTRIBUTE}]`;

// Les vignettes ne partent pas toutes ensemble : la n-ième, dans l'ordre de lecture, retarde sa boucle de n × 300 ms. L'horloge reste
// commune (celle des images) ; seule la phase change, donc une vignette agrandie, qui a le même retard que sa carte, reprend où elle en est.

import { createContext } from "react";

export const THUMBNAIL_STAGGER_MS = 300;

export const thumbnailDelayMs = (order: number): number => order * THUMBNAIL_STAGGER_MS;

// Le retard de la vignette qu'on dessine : 0 hors d'une liste.
export const ThumbnailDelayContext = createContext(0);

// À l'instant t, la vignette retardée montre ce que la même vignette sans retard montrait `delayMs` plus tôt.
export const delayedTime = (timeMs: number, delayMs: number): number => timeMs - delayMs;

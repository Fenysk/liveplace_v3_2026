// Le vol d'un pixel de la fresque du téléphone à SA case sur la fresque du stream (Écart §9.1, JOURNAL 2026-10-22).
// Un carré de 1 px que `scale` agrandit à la taille de la case : tout est en pixels concrets, calculés d'après
// `getBoundingClientRect`, qui tient compte de la réduction du téléphone. Jamais `var()` dans des `@keyframes` : ça saccade.

export type Box = { x: number; y: number; width: number; height: number };

export const FLIGHT_MS = 500;
export const FLIGHT_STAGGER_MS = 70;
export const FLIGHT_LIFT_PX = 40; // le point milieu passe au-dessus des deux cases
export const FLIGHT_EASING = "ease-in-out";
export const WAVE_MS = 450;

const MIDDLE_ENLARGE = 1.5;
const WAVE_FROM = 0.5;
const WAVE_TO = 1.3;

export const flightDelayMs = (order: number): number => order * FLIGHT_STAGGER_MS;

const place = (x: number, y: number, size: number): string => `translate(${x}px, ${y}px) scale(${size})`;

// Trois images clés : la case du téléphone, le point milieu relevé et agrandi, la case du stream.
export const flightKeyframes = (from: Box, to: Box): Keyframe[] => {
  const size = Math.max(from.width, to.width) * MIDDLE_ENLARGE;
  const centreX = (from.x + from.width / 2 + (to.x + to.width / 2)) / 2;
  const centreY = Math.min(from.y + from.height / 2, to.y + to.height / 2) - FLIGHT_LIFT_PX;
  return [
    { transform: place(from.x, from.y, from.width) },
    { transform: place(centreX - size / 2, centreY - size / 2, size), offset: 0.5 },
    { transform: place(to.x, to.y, to.width) },
  ];
};

// L'onde du doigt : un rond centré sur ce qu'il touche (le centrage est au CSS), qui grandit en s'effaçant.
export const waveKeyframes = (centre: { x: number; y: number }): Keyframe[] => [
  { transform: `translate(${centre.x}px, ${centre.y}px) scale(${WAVE_FROM})`, opacity: 1 },
  { transform: `translate(${centre.x}px, ${centre.y}px) scale(${WAVE_TO})`, opacity: 0 },
];

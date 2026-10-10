// Les images que l'aperçu d'un canvas dessine et que l'infra écrit en PNG : à palette, ou en couleurs vraies.

export type Rgb = readonly [red: number, green: number, blue: number];

// `pixels` : un index de palette par pixel, ligne après ligne.
export type IndexedImage = { width: number; height: number; palette: readonly Rgb[]; pixels: Uint8Array };

// `rgb` : trois octets par pixel, ligne après ligne.
export type RgbImage = { width: number; height: number; rgb: Uint8Array };

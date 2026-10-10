// Écart §9.1 (JOURNAL 2026-10-10) : l'image de la carte d'aperçu d'un lien. Satori dessine l'arbre d'éléments en SVG (le texte
// en tracés, avec Nunito), resvg le rastérise en PNG. Rien n'est lu sur le disque : les polices sont incrustées au build.

import nunito700 from "@fontsource/nunito/files/nunito-latin-700-normal.woff?inline";
import nunito800 from "@fontsource/nunito/files/nunito-latin-800-normal.woff?inline";
import nunito900 from "@fontsource/nunito/files/nunito-latin-900-normal.woff?inline";
import { Resvg } from "@resvg/resvg-js";
import { createElement, type ReactNode } from "react";
import satori from "satori";

export type CardSize = { width: number; height: number };

// Un `?inline` est une data URI : Satori veut les octets de la police. Les graisses du design system : caption et body 700,
// title 800, heading et display 900 (tokens.css).
const fontBytes = (dataUri: string): Buffer => Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");
export const CARD_FONT_FAMILY = "Nunito";
const FONTS = [
  { name: CARD_FONT_FAMILY, weight: 700, style: "normal", data: fontBytes(nunito700) },
  { name: CARD_FONT_FAMILY, weight: 800, style: "normal", data: fontBytes(nunito800) },
  { name: CARD_FONT_FAMILY, weight: 900, style: "normal", data: fontBytes(nunito900) },
] as const;

export type TextToMeasure = { text: string; fontWeight: 700 | 800 | 900 };

const MEASURE_SIZE = 100;
const MEASURE_WIDTH = 8_000; // plus large que le plus long nom à 100 px

// La largeur de chaque texte à 100 px, dans l'ordre : à une autre taille, elle suit la taille. Satori fait la mise en
// page, sans rastériser : c'est elle qui sait la largeur que Nunito donne à un texte.
export async function measureCardTexts(texts: readonly TextToMeasure[]): Promise<number[]> {
  const rows = texts.map(({ text, fontWeight }) =>
    createElement(
      "div",
      { style: { display: "flex", fontSize: MEASURE_SIZE, fontWeight, whiteSpace: "nowrap" } },
      text,
    ),
  );
  const root = createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        width: MEASURE_WIDTH,
        fontFamily: CARD_FONT_FAMILY,
      },
    },
    ...rows,
  );
  const widths: number[] = [];
  await satori(root, {
    width: MEASURE_WIDTH,
    height: MEASURE_SIZE * 2 * texts.length,
    fonts: [...FONTS],
    // Seule la boîte d'un texte porte `textContent`.
    onNodeDetected: ({ textContent, width }) => {
      if (textContent !== undefined) widths.push(width);
    },
  });
  return widths;
}

export async function renderCardPng(
  card: ReactNode,
  { width, height }: CardSize,
): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(card, { width, height, fonts: [...FONTS] });
  // Le texte est déjà en tracés : resvg n'a aucune police à charger, et ne fouille pas celles du système.
  const png = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
  return Uint8Array.from(png);
}

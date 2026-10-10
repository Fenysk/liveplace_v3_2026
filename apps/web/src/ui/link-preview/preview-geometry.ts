// Écart §9.1 (JOURNAL 2026-10-10) : la géométrie de l'image d'aperçu « F · Ambiance » choisie par Alexis. Le canvas net à
// gauche, le panneau à sa droite, et les tailles de texte qui suivent la largeur du panneau.

import { PREVIEW_IMAGE_HEIGHT, PREVIEW_IMAGE_WIDTH } from "./link-preview";

export const MARGIN = 48;
export const GAP = 48; // entre le canvas et le panneau
export const MIN_TEXT = 400; // la largeur que le panneau garde toujours
export const PANEL_PADDING = 40;
export const PANEL_BORDER = 2;
const MIN_NAME_SIZE = 36;
export const ADDRESS_SIZE = 28; // « LivePlace.tv/login », en bas du panneau
export const ADDRESS_GAP = 6; // entre « .tv » et « /login »

export type Box = { left: number; top: number; width: number; height: number };

// `inner` : la largeur du panneau sans son rembourrage, qui règle les tailles ; `content` : celle du texte, bordure comprise.
export type PreviewGeometry = { canvas: Box; panel: Box; inner: number; content: number };

const clamp = (min: number, value: number, max: number): number => Math.min(Math.max(value, min), max);

// Le canvas remplit sa place d'un facteur qui n'est pas entier : les cases sont les plus proches voisines, quelques pixels
// d'écart entre elles. Il n'est jamais plus large que la place que laisse le texte, ni plus haut que la carte moins ses marges.
export function previewGeometry(cols: number, rows: number): PreviewGeometry {
  const maxWidth = PREVIEW_IMAGE_WIDTH - 2 * MARGIN - GAP - MIN_TEXT;
  const maxHeight = PREVIEW_IMAGE_HEIGHT - 2 * MARGIN;
  const width = Math.floor(Math.min(maxWidth, (maxHeight * cols) / rows));
  const height = Math.floor(Math.min((maxWidth * rows) / cols, maxHeight));
  const left = MARGIN + width + GAP;
  const panelWidth = PREVIEW_IMAGE_WIDTH - MARGIN - left;
  return {
    canvas: { left: MARGIN, top: Math.round((PREVIEW_IMAGE_HEIGHT - height) / 2), width, height },
    panel: { left, top: MARGIN, width: panelWidth, height: maxHeight },
    inner: panelWidth - 2 * PANEL_PADDING,
    content: panelWidth - 2 * (PANEL_PADDING + PANEL_BORDER),
  };
}

export const invitationSize = (inner: number): number => Math.round(clamp(28, inner / 10.4, 48));
export const nameSize = (inner: number): number => Math.round(clamp(52, (inner - 96) / 3.6, 96));
export const avatarSize = (size: number): number => Math.round(size * 1.15);
export const nameGap = (size: number): number => Math.round(size * 0.3);
export const initialSize = (avatar: number): number => Math.round(avatar * 0.45);

type NameFitInput = { width100: number; available: number; size: number };

// L'avatar et le pseudo sur une ligne : la plus grande taille, jusqu'à celle voulue, qui laisse tout tenir dans `available`
// (la largeur du pseudo suit sa taille : `width100` est celle à 100 px). À 36 px, ce qui ne tient pas se coupe par « … ».
export function fitName({ width100, available, size: wanted }: NameFitInput): {
  size: number;
  isTruncated: boolean;
} {
  const rowWidth = (size: number): number => (width100 * size) / 100 + avatarSize(size) + nameGap(size);
  let size = wanted;
  while (size > MIN_NAME_SIZE && rowWidth(size) > available) size--;
  return { size, isTruncated: rowWidth(size) > available };
}

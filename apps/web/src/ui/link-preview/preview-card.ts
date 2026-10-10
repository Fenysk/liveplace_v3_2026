// Écart §9.1 (JOURNAL 2026-10-10) : la mise en page « F · Ambiance » de l'image d'aperçu d'un lien, choisie par Alexis,
// dessinée par Satori (infra/card-png.ts) en apparence sombre. Le fond : le canvas en cover, flou, sous un voile ; devant, le
// canvas net, son contour et un panneau (le thème, l'invitation, la photo et le pseudo, l'adresse).
// Des `createElement` et non du JSX : cet arbre n'est jamais une page, il n'a pas à passer par les classes du design system
// (design-system.test.ts). Satori ne rend qu'un sous-ensemble du CSS : un `div` à plusieurs enfants est toujours `display: flex`.

import { type CSSProperties, createElement, type ReactElement, type ReactNode } from "react";
import { darkShade } from "../design/dark-shade";
import { PREVIEW_IMAGE_HEIGHT, PREVIEW_IMAGE_WIDTH } from "./link-preview";
import {
  ADDRESS_GAP,
  ADDRESS_SIZE,
  avatarSize,
  initialSize,
  invitationSize,
  nameGap,
  PANEL_BORDER,
  PANEL_PADDING,
  type PreviewGeometry,
} from "./preview-geometry";

const SHADES = {
  void: darkShade("--void"),
  ink: darkShade("--ink"),
  muted: darkShade("--muted"),
  chip: darkShade("--chip"),
  panel: darkShade("--pill-surface"),
  panelBorder: darkShade("--pill-border"),
  white: darkShade("--png-white"),
};

const FONT_FAMILY = "Nunito";
export const BRAND_NAME = "LivePlace";
export const BRAND_SUFFIX = ".tv";
const VEIL_OPACITY = 0.8; // le voile : le vide du jeu à 80 %
const CANVAS_OUTLINE = 2;
const PANEL_RADIUS = 36;
const MIDDLE_GAP = 20;
const THEME_GAP = 12;
const THEME_LINES = 2; // un thème plus long est coupé par « … » à la fin de la deuxième ligne
// La ligne du « Thème » petit est assez haute pour que sa ligne de base tombe sur celle de la première ligne du thème.
const CAPTION_LINE = 33;
const ROUNDING_ROOM = 2; // la largeur mesurée est arrondie : un texte qui tient pile ne doit pas être coupé

export type PreviewCardProps = {
  geometry: PreviewGeometry;
  login: string;
  name: string; // le pseudo écrit : son initiale tient lieu de photo manquante
  nameFit: { size: number; isTruncated: boolean };
  loginWidth: number; // la largeur de « /login » à la taille du bas
  brandWidth: number; // celle de « LivePlace.tv » à la même taille
  invitation: readonly [first: string, second: string]; // les phrases viennent des textes localisés (hard-coded-texts.test.ts)
  themeCaption: string;
  theme?: string | undefined;
  photo: string | null; // une data URI ; sans elle, l'initiale, comme le design system
  canvasSrc: string;
  backdropSrc: string;
};

const box = (style: CSSProperties, ...children: ReactNode[]): ReactElement =>
  createElement("div", { style: { display: "flex", ...style } }, ...children);

const picture = (src: string, width: number, height: number, style: CSSProperties = {}): ReactElement =>
  createElement("img", { src, width, height, alt: "", style });

const avatarOf = ({
  name,
  photo,
  size,
}: {
  name: string;
  photo: string | null;
  size: number;
}): ReactElement => {
  if (photo) return picture(photo, size, size, { borderRadius: size / 2, objectFit: "cover" });
  return box(
    {
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: SHADES.chip,
      color: SHADES.ink,
      fontSize: initialSize(size),
      fontWeight: 800,
    },
    (Array.from(name)[0] ?? "").toUpperCase(),
  );
};

// Le thème, en texte seul : « Thème » petit et gris, le thème à côté, qui revient à la ligne dans sa colonne.
const themeOf = (caption: string, theme: string): ReactElement =>
  box(
    // Chaque hauteur de ligne est posée sur le texte lui-même : Satori en ferait un rapport à la taille du parent si elle
    // se transmettait, et les lignes du thème s'écarteraient de 45 px.
    { alignItems: "flex-start", gap: THEME_GAP },
    box({ fontSize: 20, fontWeight: 700, lineHeight: `${CAPTION_LINE}px`, color: SHADES.muted }, caption),
    box(
      // `display: block` : c'est la seule boîte où Satori applique `lineClamp`.
      {
        display: "block",
        flex: 1,
        fontSize: 24,
        fontWeight: 800,
        lineHeight: 1.25,
        lineClamp: THEME_LINES,
        color: SHADES.ink,
      },
      theme,
    ),
  );

const invitationOf = (lines: readonly [string, string], size: number): ReactElement =>
  box(
    { flexDirection: "column", fontSize: size, fontWeight: 800, lineHeight: 1.12, color: SHADES.ink },
    box({}, lines[0]),
    box({}, lines[1]),
  );

// Le pseudo coupé par « … » quand il ne tient pas, même à la plus petite taille.
const identityOf = (props: PreviewCardProps): ReactElement => {
  const { geometry, name, photo, nameFit } = props;
  const avatar = avatarSize(nameFit.size);
  const gap = nameGap(nameFit.size);
  return box(
    { alignItems: "center", gap },
    avatarOf({ name, photo, size: avatar }),
    box(
      {
        width: geometry.content - avatar - gap,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: nameFit.size,
        fontWeight: 900,
        lineHeight: 1,
        color: SHADES.ink,
      },
      name,
    ),
  );
};

// « LivePlace.tv/login » : le nom de la marque en blanc, le reste en gris ; le login est coupé s'il manque de place.
const addressOf = ({ geometry, login, loginWidth, brandWidth }: PreviewCardProps): ReactElement =>
  box(
    { alignItems: "baseline", fontSize: ADDRESS_SIZE, lineHeight: 1 },
    box({ fontWeight: 900, color: SHADES.white }, BRAND_NAME),
    box({ fontWeight: 800, color: SHADES.muted }, BRAND_SUFFIX),
    box(
      {
        width: Math.min(Math.ceil(loginWidth) + ROUNDING_ROOM, geometry.content - brandWidth - ADDRESS_GAP),
        marginLeft: ADDRESS_GAP,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 800,
        color: SHADES.muted,
      },
      `/${login}`,
    ),
  );

const panelOf = (props: PreviewCardProps): ReactElement => {
  const { geometry, invitation, themeCaption, theme } = props;
  return box(
    {
      position: "absolute",
      left: geometry.panel.left,
      top: geometry.panel.top,
      width: geometry.panel.width,
      height: geometry.panel.height,
      flexDirection: "column",
      boxSizing: "border-box",
      padding: PANEL_PADDING,
      backgroundColor: SHADES.panel,
      border: `${PANEL_BORDER}px solid ${SHADES.panelBorder}`,
      borderRadius: PANEL_RADIUS,
    },
    theme ? themeOf(themeCaption, theme) : null,
    box(
      {
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: MIDDLE_GAP,
      },
      invitationOf(invitation, invitationSize(geometry.inner)),
      identityOf(props),
    ),
    addressOf(props),
  );
};

export const previewCard = (props: PreviewCardProps): ReactElement => {
  const { geometry, canvasSrc, backdropSrc } = props;
  const { canvas } = geometry;
  const [width, height] = [PREVIEW_IMAGE_WIDTH, PREVIEW_IMAGE_HEIGHT];
  return box(
    {
      position: "relative",
      width,
      height,
      backgroundColor: SHADES.void,
      color: SHADES.ink,
      fontFamily: FONT_FAMILY,
    },
    picture(backdropSrc, width, height, { position: "absolute", left: 0, top: 0 }),
    box({
      position: "absolute",
      left: 0,
      top: 0,
      width,
      height,
      backgroundColor: SHADES.void,
      opacity: VEIL_OPACITY,
    }),
    // Le contour tombe autour du canvas, à l'extérieur : le canvas garde sa place, sur des pixels entiers.
    box(
      {
        position: "absolute",
        left: canvas.left - CANVAS_OUTLINE,
        top: canvas.top - CANVAS_OUTLINE,
        width: canvas.width + 2 * CANVAS_OUTLINE,
        height: canvas.height + 2 * CANVAS_OUTLINE,
        backgroundColor: SHADES.ink,
      },
      picture(canvasSrc, canvas.width, canvas.height, {
        position: "absolute",
        left: CANVAS_OUTLINE,
        top: CANVAS_OUTLINE,
      }),
    ),
    panelOf(props),
  );
};

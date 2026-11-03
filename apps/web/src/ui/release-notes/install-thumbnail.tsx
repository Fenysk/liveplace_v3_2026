// « App mobile » : un téléphone en petit. Son écran d'accueil porte l'icône de l'appli (la pastille « LP » du manifest, aux teintes sombres
// quelle que soit l'apparence) sous son nom court (« LP »), parmi d'autres applis en formes grises sans pictogramme. Un doigt appuie sur l'icône ;
// l'appli s'ouvre depuis l'icône sur tout l'écran, sans barre de navigateur : la fresque, la pill Compte et la pill Dessin du jeu
// (install-motion.ts). L'image fixe : l'appli ouverte, sans le doigt. Des `<span>` et un SVG : jamais de lien, la vignette est déjà un bouton.

import { Sparkles, SunMoon } from "lucide-react";
import { useRef } from "react";
import { Avatar } from "../design/profile";
import { enterLabel } from "../draft/draft-labels";
import { useLocale } from "../locale/use-locale";
import { GaugeMini } from "./gauge-mini";
import { INSTALL_RESTING_MS, installAt } from "./install-motion";
import { PillButton, PillTool } from "./pill-tool";
import { motifCells } from "./pixel-motifs";
import { ArtAt } from "./scene-art";
import { layersOfCells } from "./thumbnail-art";
import { setPointer, setTaps, Touch } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

// Le nom sous l'icône est celui de l'appli : « LP ».
const APP_NAME = "LP";
const VIEWER = "Kira";
// « 20/20 » : la jauge est pleine, son nombre répète sa capacité.
const GAUGE_TEXT = "20/20";

// L'écran d'accueil : 4 colonnes sur 5 rangées ; l'icône de l'appli est à la 2e colonne de la 3e rangée, les autres sont des formes grises.
const HOME_SLOTS = Array.from({ length: 20 }, (_, index) => ({ id: `app-${index}`, isOurs: index === 9 }));

const CAT_LAYERS = layersOfCells(motifCells("cat", 0, 0));
const HEART_LAYERS = layersOfCells(motifCells("heart", 0, 0));
const CAT_AT = { x: 5, y: 14 } as const;
const HEART_AT = { x: 8, y: 36 } as const;

// Chaque image : l'appli de l'icône à tout l'écran (une variable), l'appui de l'icône, le doigt.
const renderInstall = (host: HTMLElement, timeMs: number): void => {
  const moment = installAt(timeMs);
  setThumbnailVariable(host, "--lp-release-open", moment.open);
  setTaps(host, { app: moment.tap });
  setPointer(host, moment.pointer, moment.press);
};

// L'icône de l'appli : un carré arrondi sombre et « LP » en Nunito 900, comme les PNG du manifest. `data-appearance="dark"` : ses teintes
// sont celles de l'apparence sombre, dans les deux apparences.
const AppIcon = () => (
  <svg className="lp-release-app-icon" viewBox="0 0 100 100" data-appearance="dark" aria-hidden="true">
    <rect className="lp-release-app-tile" width={100} height={100} rx={22} />
    <text className="lp-release-app-letters" x={50} y={65} textAnchor="middle">
      LP
    </text>
  </svg>
);

const HomeSlot = ({ isOurs }: { isOurs: boolean }) =>
  isOurs ? (
    <span className="lp-release-app-slot" data-tap="app">
      <AppIcon />
      <span className="lp-release-app-name">{APP_NAME}</span>
    </span>
  ) : (
    <span className="lp-release-app-slot">
      <span className="lp-release-app-icon lp-release-app-icon--other" />
      <span className="lp-release-app-bar" />
    </span>
  );

export const InstallThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const locale = useLocale();
  useVisibleLoop(host, renderInstall, INSTALL_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-install">
      <span className="lp-release-phone">
        <span className="lp-release-phone-screen">
          <span className="lp-release-home">
            {HOME_SLOTS.map(({ id, isOurs }) => (
              <HomeSlot key={id} isOurs={isOurs} />
            ))}
          </span>
          <span className="lp-release-app">
            <svg
              className="lp-release-phone-art"
              viewBox="0 0 31.6 65.6"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <rect className="lp-release-shadow" x={2} y={8.4} width={28.6} height={50.8} />
              <rect className="lp-release-paper" x={1.5} y={7.4} width={28.6} height={50.8} />
              <ArtAt layers={CAT_LAYERS} x={CAT_AT.x} y={CAT_AT.y} />
              <ArtAt layers={HEART_LAYERS} x={HEART_AT.x} y={HEART_AT.y} />
            </svg>
            <span className="lp-pill lp-release-pill lp-release-phone-pill lp-release-phone-pill--top">
              <span className="lp-pill-content">
                <Avatar displayName={VIEWER} />
                <PillTool icon={Sparkles} />
                <PillTool icon={SunMoon} />
              </span>
            </span>
            <span className="lp-pill lp-release-pill lp-release-phone-pill lp-release-phone-pill--bottom">
              <span className="lp-pill-content">
                <GaugeMini>
                  <span className="lp-gauge-text lp-gauge-text--charge lp-type-numeric">{GAUGE_TEXT}</span>
                </GaugeMini>
                <PillButton label={enterLabel(0, locale)} variant="primary" />
              </span>
            </span>
          </span>
        </span>
      </span>
      <Touch />
    </span>
  );
};

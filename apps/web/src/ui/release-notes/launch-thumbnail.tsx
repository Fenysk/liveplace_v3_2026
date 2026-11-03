// « Lancement de LivePlace (bêta) » : une mini-fresque et, en haut à droite, la pill Compte d'un invité (Nouveautés, l'apparence, et Se
// connecter aux couleurs de Twitch). Une souris clique Se connecter ; la pill devient celle du compte connecté (Nouveautés, la photo,
// l'apparence). Puis trois dessins arrivent l'un après l'autre, case après case, comme ceux de trois viewers (launch-motion.ts).
// L'image fixe : le compte connecté et les trois dessins, sans la souris.

import { PALETTE } from "@liveplace/domain";
import { Sparkles, SunMoon } from "lucide-react";
import { useRef } from "react";
import { ACCOUNT_TEXTS } from "../account/account-texts";
import { Avatar } from "../design/profile";
import { TwitchGlyph } from "../design/twitch";
import { useTexts } from "../locale/use-locale";
import { ARRIVAL_CELLS, ARRIVALS, arrivalAt, LAUNCH_RESTING_MS, launchAt } from "./launch-motion";
import { MiniCanvas } from "./mini-canvas";
import { PillButton, PillTool } from "./pill-tool";
import { CELL } from "./scene-art";
import { Pointer, setPartOpacity, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

const MEMBER = "Ana";

// Chaque image : l'une ou l'autre pill, l'appui de Se connecter, chaque case des trois dessins, la souris.
const renderLaunch = (host: HTMLElement, timeMs: number): void => {
  const moment = launchAt(timeMs);
  setThumbnailVariable(host, "--lp-release-guest", moment.guest);
  setThumbnailVariable(host, "--lp-release-account", moment.account);
  setPartOpacity(host, "drawings", moment.drawings);
  for (const cell of host.querySelectorAll<SVGRectElement>("rect[data-drawing]")) {
    const opacity = arrivalAt(Number(cell.dataset.drawing), Number(cell.dataset.cell), timeMs);
    cell.setAttribute("opacity", String(opacity));
  }
  setTaps(host, { signIn: moment.signInTap });
  setPointer(host, moment.pointer, moment.press);
};

export const LaunchThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const t = useTexts(ACCOUNT_TEXTS);
  useVisibleLoop(host, renderLaunch, LAUNCH_RESTING_MS);
  const resting = launchAt(LAUNCH_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-launch">
      <MiniCanvas layers={[]}>
        <g data-part="drawings" opacity={resting.drawings}>
          {ARRIVALS.map(({ motif, x, y }, drawing) => (
            <g key={motif} transform={`translate(${x} ${y}) scale(${CELL})`}>
              {ARRIVAL_CELLS[drawing]?.map((cell, index) => (
                <rect
                  key={`${cell.x},${cell.y}`}
                  data-drawing={drawing}
                  data-cell={index}
                  x={cell.x}
                  y={cell.y}
                  width={1}
                  height={1}
                  fill={PALETTE[cell.colorIndex]}
                  opacity={arrivalAt(drawing, index, LAUNCH_RESTING_MS)}
                />
              ))}
            </g>
          ))}
        </g>
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--top-right lp-release-guest">
        <span className="lp-pill-content">
          <PillTool icon={Sparkles} />
          <PillTool icon={SunMoon} />
          <PillButton label={t.signIn} icon={TwitchGlyph} variant="twitch" tap="signIn" />
        </span>
      </span>
      <span className="lp-pill lp-release-pill lp-release-pill--top-right lp-release-account">
        <span className="lp-pill-content">
          <PillTool icon={Sparkles} />
          <Avatar displayName={MEMBER} />
          <PillTool icon={SunMoon} />
        </span>
      </span>
      <Pointer />
    </span>
  );
};

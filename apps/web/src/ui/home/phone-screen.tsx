// L'écran du téléphone de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : la vraie interface mobile, à sa taille réelle. Au PC,
// home.css le réduit dans un cadre ; sur un écran étroit, il est la page. La pill d'identité n'a pas de nom (une barre de
// squelette), la feuille a sa poignée, la vraie jauge, le bouton d'envoi et six couleurs de la vraie palette.
// Monté dans le navigateur seulement : la jauge et la palette posent des `style`, que la CSP de production bloque dans le HTML
// du serveur.

import { useEffect, useState } from "react";
import { Button } from "../design/button";
import { Gauge } from "../design/gauge";
import { Palette } from "../design/palette";
import { Pill } from "../design/pill";
import { SkeletonProfile } from "../design/skeleton";
import { enterLabel, formatWait, msToNextSecond, waitSecondsOf } from "../draft/draft-labels";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import { useLocale, useTexts } from "../locale/use-locale";
import {
  advanceGauge,
  DEMO_PALETTE,
  type DemoGauge,
  type DemoState,
  GAUGE_MAX,
  REFILL_MS,
} from "./home-demo";
import { HOME_TEXTS } from "./home-texts";
import { PixelGrid } from "./pixel-grid";

type GaugeProps = { gauge: DemoGauge; draftSize: number; shakeCount: number };

// La jauge de la démo, à la seconde : son anneau compte jusqu'au prochain pixel (2 s), son tube se remplit.
const DemoGaugeView = ({ gauge, draftSize, shakeCount }: GaugeProps) => {
  const locale = useLocale();
  const [, setTick] = useState(0);
  // L'instant se lit à chaque rendu : après une dépense, le compte repart de la bonne seconde.
  const nowMs = Date.now();
  const { charges, refillEndsAt } = advanceGauge(gauge, nowMs);
  useEffect(() => {
    if (refillEndsAt === null) return;
    const timer = setTimeout(() => setTick((tick) => tick + 1), msToNextSecond(refillEndsAt, Date.now()));
    return () => clearTimeout(timer);
  });
  const secondsLeft = refillEndsAt === null ? 0 : waitSecondsOf(refillEndsAt - nowMs);
  return (
    <Gauge
      charges={charges}
      max={GAUGE_MAX}
      draft={draftSize}
      refill={refillEndsAt === null ? null : { endsAt: refillEndsAt, durationMs: REFILL_MS, secondsLeft }}
      label={DRAFT_TEXTS[locale].gaugeLabel({
        charges,
        max: GAUGE_MAX,
        afterPlacement: draftSize > 0 ? Math.max(0, charges - draftSize) : undefined,
        nextRefill: refillEndsAt === null ? undefined : { charges: 1, countdown: formatWait(secondsLeft) },
        claimable: 0,
      })}
      shakeCount={shakeCount}
      isFill
    />
  );
};

type PhoneScreenProps = {
  state: DemoState;
  onTouch: (cell: number) => void;
  onPick: (colorIndex: number) => void;
  onSend: () => void;
};

export const PhoneScreen = ({ state, onTouch, onPick, onSend }: PhoneScreenProps) => {
  const home = useTexts(HOME_TEXTS);
  const locale = useLocale();
  return (
    <>
      <div className="lp-home-identity">
        <Pill>
          <SkeletonProfile />
        </Pill>
      </div>
      <div className="lp-home-canvas">
        <PixelGrid
          name="phone"
          cells={state.placed}
          draft={state.draft}
          onTouch={onTouch}
          label={home.demoCanvas}
        />
      </div>
      <div className="lp-home-sheet">
        <Pill layout="stack">
          <span className="lp-grabber" aria-hidden="true" />
          <div className="lp-row">
            <DemoGaugeView gauge={state.gauge} draftSize={state.draft.size} shakeCount={state.shakeCount} />
            <span data-send="">
              {/* Dans la démo, le bouton dit « Dessiner · n » : le jeu garde « Valider ». */}
              <Button
                label={enterLabel(state.draft.size, locale)}
                variant="primary"
                isDisabled={state.draft.size === 0}
                hasMorphingLabel
                onPress={onSend}
              />
            </span>
          </div>
          <Palette
            palette={DEMO_PALETTE}
            colorIndex={state.colorIndex}
            onPick={onPick}
            isTouch
            hasEraser={false}
          />
        </Pill>
      </div>
    </>
  );
};

// La section Vue OBS de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-25), pour le streamer : l'adresse à copier, la
// marche à suivre, le délai, et le fond. L'affichage seul, nourri par `ObsTab`.

import { OBS_DELAY_STEPS_MS, type ObsBackground } from "@liveplace/domain";
import { useMemo } from "react";
import { CopyButton } from "../design/copy-button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { SwatchChoice, type SwatchOption } from "../design/palette";
import { Slider, type SliderStep } from "../design/slider";
import { useLocale, useTexts } from "../locale/use-locale";
import { obsDelayLabel } from "./obs-delay-label";
import { OBS_TEXTS } from "./obs-texts";

type ObsSettingsProps = {
  address: string; // sans le protocole : ce que le streamer lit
  url: string; // ce qu'il colle dans OBS
  obsDelayMs: number;
  onPickDelay: (obsDelayMs: number) => void;
  obsBackground: ObsBackground;
  onPickBackground: (obsBackground: ObsBackground) => void; // JOURNAL 2026-09-29
  isTouch?: boolean; // écran étroit ou tactile : les pastilles du fond sont rondes, de la taille d'un contrôle
};

export const ObsSettings = ({
  address,
  url,
  obsDelayMs,
  onPickDelay,
  obsBackground,
  onPickBackground,
  isTouch = false,
}: ObsSettingsProps) => {
  const locale = useLocale();
  const t = useTexts(OBS_TEXTS);
  const { backgroundNames } = useTexts(DESIGN_TEXTS);
  // Le clavier de couleurs du PNG : transparent sur son damier, le noir et le blanc par leur teinte, les mêmes vrais noir et
  // blanc que ceux de la vue OBS (tokens.css).
  const backgroundOptions: readonly SwatchOption<ObsBackground>[] = [
    { value: "transparent", label: backgroundNames.transparent },
    { value: "black", label: backgroundNames.black, tone: "png-black" },
    { value: "white", label: backgroundNames.white, tone: "png-white" },
  ];
  const delaySteps = useMemo<readonly SliderStep[]>(
    () => OBS_DELAY_STEPS_MS.map((value) => ({ value, label: obsDelayLabel(value, locale) })),
    [locale],
  );
  return (
    <>
      <div className="lp-setting">
        <span className="lp-type-body">{t.address}</span>
        <CopyButton value={address} copyText={url} />
        <p className="lp-type-caption lp-muted">{t.howTo}</p>
      </div>
      <div className="lp-setting">
        <Slider label={t.delay} steps={delaySteps} value={obsDelayMs} onPick={onPickDelay} />
        <p className="lp-type-caption lp-muted">{t.delayNote}</p>
      </div>
      <div className="lp-setting">
        <SwatchChoice
          label={t.background}
          options={backgroundOptions}
          value={obsBackground}
          onSelect={onPickBackground}
          isTouch={isTouch}
        />
        <p className="lp-type-caption lp-muted">{t.backgroundNote}</p>
      </div>
    </>
  );
};

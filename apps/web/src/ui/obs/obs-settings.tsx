// La section Vue OBS de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-25), pour le streamer : l'adresse à copier, la
// marche à suivre, et le délai. Le fond est dans la section Fresque (Écart §9.1, JOURNAL 2026-10-10). L'affichage seul, nourri
// par `ObsTab`.

import { OBS_DELAY_STEPS_MS } from "@liveplace/domain";
import { useMemo } from "react";
import { CopyButton } from "../design/copy-button";
import { Slider, type SliderStep } from "../design/slider";
import { BubbleTarget } from "../help/bubble-target";
import { useLocale, useTexts } from "../locale/use-locale";
import { obsDelayLabel } from "./obs-delay-label";
import { OBS_TEXTS } from "./obs-texts";

type ObsAddressProps = {
  address: string; // sans le protocole : ce que le streamer lit
  url: string; // ce qu'il colle dans OBS
  onCopy?: (() => void) | undefined; // l'adresse est copiée (Écart §8.1, JOURNAL 2026-10-09)
};

// L'adresse à coller dans OBS : le champ qui la copie est la cible de la dernière bulle de la chaîne OBS.
export const ObsAddress = ({ address, url, onCopy }: ObsAddressProps) => (
  <>
    <span className="lp-type-body">{useTexts(OBS_TEXTS).address}</span>
    <BubbleTarget name="obs-address">
      <CopyButton value={address} copyText={url} onCopy={onCopy} />
    </BubbleTarget>
  </>
);

type ObsSettingsProps = ObsAddressProps & {
  obsDelayMs: number;
  onPickDelay: (obsDelayMs: number) => void;
};

export const ObsSettings = ({ address, url, onCopy, obsDelayMs, onPickDelay }: ObsSettingsProps) => {
  const locale = useLocale();
  const t = useTexts(OBS_TEXTS);
  const delaySteps = useMemo<readonly SliderStep[]>(
    () => OBS_DELAY_STEPS_MS.map((value) => ({ value, label: obsDelayLabel(value, locale) })),
    [locale],
  );
  return (
    <>
      <div className="lp-setting">
        <ObsAddress address={address} url={url} onCopy={onCopy} />
        <p className="lp-type-caption lp-muted">{t.howTo}</p>
      </div>
      <div className="lp-setting">
        <Slider label={t.delay} steps={delaySteps} value={obsDelayMs} onPick={onPickDelay} />
        <p className="lp-type-caption lp-muted">{t.delayNote}</p>
      </div>
    </>
  );
};

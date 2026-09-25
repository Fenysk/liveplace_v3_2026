// La section Vue OBS de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-25), pour le streamer : l'adresse à copier, la
// marche à suivre, et le délai. L'affichage seul, nourri par `ObsTab`.

import { OBS_DELAY_STEPS_MS } from "@liveplace/domain";
import { CopyButton } from "../design/copy-button";
import { Slider, type SliderStep } from "../design/slider";
import { obsDelayLabel } from "./obs-delay-label";

const DELAY_STEPS: readonly SliderStep[] = OBS_DELAY_STEPS_MS.map((value) => ({
  value,
  label: obsDelayLabel(value),
}));

type ObsSettingsProps = {
  address: string; // sans le protocole : ce que le streamer lit
  url: string; // ce qu'il colle dans OBS
  obsDelayMs: number;
  onPickDelay: (obsDelayMs: number) => void;
};

export const ObsSettings = ({ address, url, obsDelayMs, onPickDelay }: ObsSettingsProps) => (
  <>
    <div className="lp-setting">
      <span className="lp-type-body">Adresse à coller dans OBS</span>
      <CopyButton value={address} copyText={url} />
      <p className="lp-type-caption lp-muted">
        Dans OBS Studio ou Streamlabs : Sources, +, Navigateur. Colle l'adresse, choisis une taille carrée
        (1080 × 1080 par exemple). C'est tout : le fond est déjà transparent.
      </p>
    </div>
    <div className="lp-setting">
      <Slider label="Délai" steps={DELAY_STEPS} value={obsDelayMs} onPick={onPickDelay} />
      <p className="lp-type-caption lp-muted">
        Le temps de retirer un pixel avant qu'il n'arrive sur le stream.
      </p>
    </div>
  </>
);

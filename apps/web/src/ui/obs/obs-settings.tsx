// La section Vue OBS de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-25), pour le streamer : l'adresse à copier, la
// marche à suivre, et le délai. L'affichage seul, nourri par `ObsTab`.

import { OBS_DELAY_STEPS_MS, type ObsBackground } from "@liveplace/domain";
import { Checkbox } from "../design/checkbox";
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
  obsBackground: ObsBackground;
  onPickBackground: (obsBackground: ObsBackground) => void; // JOURNAL 2026-09-29
};

export const ObsSettings = ({
  address,
  url,
  obsDelayMs,
  onPickDelay,
  obsBackground,
  onPickBackground,
}: ObsSettingsProps) => (
  <>
    <div className="lp-setting">
      <span className="lp-type-body">Adresse à coller dans OBS</span>
      <CopyButton value={address} copyText={url} />
      <p className="lp-type-caption lp-muted">
        Dans OBS Studio ou Streamlabs : Sources, +, Navigateur. Colle l'adresse, choisis une taille aux
        proportions de ton canvas (1080 × 1080 pour un carré, 1920 × 1080 pour un 16:9). C'est tout.
      </p>
    </div>
    <div className="lp-setting">
      <Slider label="Délai" steps={DELAY_STEPS} value={obsDelayMs} onPick={onPickDelay} />
      <p className="lp-type-caption lp-muted">
        Le temps de retirer un pixel avant qu'il n'arrive sur le stream.
      </p>
    </div>
    <div className="lp-setting">
      <Checkbox
        label="Fond transparent"
        isChecked={obsBackground === "transparent"}
        onToggle={(isTransparent) => onPickBackground(isTransparent ? "transparent" : "white")}
      />
      <p className="lp-type-caption lp-muted">Décoché, le canvas se pose sur un fond blanc dans le stream.</p>
    </div>
  </>
);

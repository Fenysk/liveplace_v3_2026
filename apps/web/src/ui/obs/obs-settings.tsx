// La section Vue OBS de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-25), pour le streamer : l'adresse à copier, la
// marche à suivre, le délai, et le fond. L'affichage seul, nourri par `ObsTab`.

import { OBS_DELAY_STEPS_MS, type ObsBackground } from "@liveplace/domain";
import { CopyButton } from "../design/copy-button";
import { SwatchChoice, type SwatchOption } from "../design/palette";
import { Slider, type SliderStep } from "../design/slider";
import { BubbleTarget } from "../help/bubble-target";
import { OBS_BACKGROUND_LABELS } from "./obs-background";
import { obsDelayLabel } from "./obs-delay-label";

// Le clavier de couleurs du PNG : transparent sur son damier, le noir et le blanc par leur teinte, les mêmes vrais noir et
// blanc que ceux de la vue OBS (tokens.css).
const BACKGROUND_OPTIONS: readonly SwatchOption<ObsBackground>[] = [
  { value: "transparent", label: OBS_BACKGROUND_LABELS.transparent },
  { value: "black", label: OBS_BACKGROUND_LABELS.black, tone: "png-black" },
  { value: "white", label: OBS_BACKGROUND_LABELS.white, tone: "png-white" },
];

const DELAY_STEPS: readonly SliderStep[] = OBS_DELAY_STEPS_MS.map((value) => ({
  value,
  label: obsDelayLabel(value),
}));

type ObsAddressProps = {
  address: string; // sans le protocole : ce que le streamer lit
  url: string; // ce qu'il colle dans OBS
  onCopy?: (() => void) | undefined; // l'adresse est copiée (Écart §8.1, JOURNAL 2026-10-09)
};

// L'adresse à coller dans OBS : le champ qui la copie est la cible de la dernière bulle de la chaîne OBS.
export const ObsAddress = ({ address, url, onCopy }: ObsAddressProps) => (
  <>
    <span className="lp-type-body">Adresse à coller dans OBS</span>
    <BubbleTarget name="obs-address">
      <CopyButton value={address} copyText={url} onCopy={onCopy} />
    </BubbleTarget>
  </>
);

type ObsSettingsProps = ObsAddressProps & {
  obsDelayMs: number;
  onPickDelay: (obsDelayMs: number) => void;
  obsBackground: ObsBackground;
  onPickBackground: (obsBackground: ObsBackground) => void; // JOURNAL 2026-09-29
  isTouch?: boolean; // écran étroit ou tactile : les pastilles du fond sont rondes, de la taille d'un contrôle
};

export const ObsSettings = ({
  address,
  url,
  onCopy,
  obsDelayMs,
  onPickDelay,
  obsBackground,
  onPickBackground,
  isTouch = false,
}: ObsSettingsProps) => (
  <>
    <div className="lp-setting">
      <ObsAddress address={address} url={url} onCopy={onCopy} />
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
      <SwatchChoice
        label="Fond de la vue OBS"
        options={BACKGROUND_OPTIONS}
        value={obsBackground}
        onSelect={onPickBackground}
        isTouch={isTouch}
      />
      <p className="lp-type-caption lp-muted">
        Transparent, le stream montre ce qu'il y a derrière les pixels. Noir ou blanc, le canvas se pose sur
        ce fond.
      </p>
    </div>
  </>
);

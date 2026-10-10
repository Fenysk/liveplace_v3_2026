// Les réglages du streamer : les sections Canvas et Vue OBS de la fenêtre, et les confirmations de la taille et de la
// jauge maximale. Les vrais composants du jeu, avec des props d'exemple.

import {
  GAUGE_MAX_CEILING,
  GAUGE_MAX_START,
  type GaugeLimits,
  type ObsBackground,
  toTheme,
} from "@liveplace/domain";
import { useState } from "react";
import {
  CanvasSettings,
  CeilingWindow,
  GaugeSettings,
  type ResizeStatus,
  ResizeWindow,
  type ThemeField,
  ThemeSettings,
} from "../canvas/canvas-settings";
import { type SizeChoice, toCanvasSize } from "../canvas/canvas-size";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { ObsSettings } from "../obs/obs-settings";
import { SAMPLE_CANVAS, SAMPLE_DRAWING } from "./design-fixtures";
import { Block, DIALOG_NOTE, Entry, InWindow, OpenWindow, StateRow } from "./entry-layout";

const LOCKED_MS = 1500; // la démonstration du verrou : l'action, puis la fermeture

// Le champ du thème : on écrit, et en le quittant (ou par Entrée) le thème est nettoyé, comme celui qui s'enregistre.
const useThemeField = (
  initial: string,
  status: ThemeField["status"] = "ready",
  isSaving = false,
): ThemeField => {
  const [value, setValue] = useState(initial);
  return { status, value, isSaving, onInput: setValue, onCommit: () => setValue(toTheme(value) ?? "") };
};

type ThemeSceneProps = { initial: string; status?: ThemeField["status"]; isSaving?: boolean };

const ThemeScene = ({ initial, status, isSaving }: ThemeSceneProps) => {
  const theme = useThemeField(initial, status, isSaving);
  return (
    <InWindow>
      <ThemeSettings theme={theme} />
    </InWindow>
  );
};

// Le thème du canvas, puis le format et la taille ; Changer la taille ouvre la confirmation, qui montre ce qui sort du
// cadre (le petit dessin d'exemple, placé au bord d'un canvas de 256).
const CanvasSettingsScene = () => {
  const theme = useThemeField("");
  const [choice, setChoice] = useState<SizeChoice>({ format: "1:1", sizeIndex: 1 });
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<ResizeStatus>("idle");
  const current = { width: 256, height: 256 };
  const chosen = toCanvasSize(choice);
  const outside = SAMPLE_DRAWING.filter(({ x, y }) => x >= chosen.width || y >= chosen.height);
  return (
    <>
      <InWindow>
        <CanvasSettings
          theme={theme}
          current={current}
          choice={choice}
          chosen={chosen}
          onChoose={setChoice}
          onApply={() => {
            setStatus("idle");
            setIsConfirming(true);
          }}
        />
      </InWindow>
      <ResizeWindow
        next={isConfirming ? chosen : null}
        outside={outside}
        status={status}
        canvas={SAMPLE_CANVAS}
        onConfirm={() => {
          setStatus("running");
          setTimeout(() => setIsConfirming(false), LOCKED_MS);
        }}
        onClose={() => setIsConfirming(false)}
      />
    </>
  );
};

// La jauge de départ et la jauge maximale ; la baisser demande une confirmation.
const GaugeSettingsScene = () => {
  const [limits, setLimits] = useState<GaugeLimits>({
    gaugeMaxStart: GAUGE_MAX_START,
    gaugeMaxCeiling: GAUGE_MAX_CEILING,
  });
  const [lowered, setLowered] = useState<GaugeLimits | null>(null);
  return (
    <>
      <InWindow>
        <GaugeSettings
          limits={limits}
          onPick={(next) =>
            next.gaugeMaxCeiling < limits.gaugeMaxCeiling ? setLowered(next) : setLimits(next)
          }
        />
      </InWindow>
      <CeilingWindow
        next={lowered}
        onConfirm={() => {
          if (lowered) setLimits(lowered);
          setLowered(null);
        }}
        onClose={() => setLowered(null)}
      />
    </>
  );
};

export const CanvasSettingsEntry = () => (
  <Entry
    slug="fenetre-canvas"
    components={["CanvasSettings", "ThemeSettings", "GaugeSettings"]}
    file="ui/canvas/canvas-settings.tsx"
    note="Pour le streamer : le thème de la fresque, qui s'enregistre quand le champ perd le focus, la taille de la fresque, sans rien perdre, et la jauge de ses joueurs (masquée dans le jeu pour l'instant)."
  >
    <Block title="États">
      <StateRow
        name="Le thème de la fresque, vide, puis un format, Petit, Moyen ou Grand"
        detail="La confirmation montre ce qui sort du cadre."
      >
        <CanvasSettingsScene />
      </StateRow>
      <StateRow name="Le thème de la fresque rempli" detail="Enregistré en quittant le champ, sans bouton.">
        <ThemeScene initial="Halloween" />
      </StateRow>
      <StateRow name="Le thème s'enregistre" detail="Le champ attend la réponse.">
        <ThemeScene initial="Halloween" isSaving />
      </StateRow>
      <StateRow name="Le thème ne se lit pas" detail="Le champ reste fermé, et le dit.">
        <ThemeScene initial="" status="unavailable" />
      </StateRow>
      <StateRow name="La jauge de départ et la jauge maximale" detail="La baisser demande une confirmation.">
        <GaugeSettingsScene />
      </StateRow>
    </Block>
  </Entry>
);

// Le vrai curseur : un cran choisi s'affiche, comme le ferait la confirmation du gateway.
const ObsSettingsScene = () => {
  const [obsDelayMs, setObsDelayMs] = useState(10_000);
  const [obsBackground, setObsBackground] = useState<ObsBackground>("transparent");
  const isTouch = useMediaQuery(COMPACT_SCREEN_QUERY);
  return (
    <InWindow>
      <ObsSettings
        address="liveplace.tv/kalyss"
        url="https://liveplace.tv/kalyss"
        obsDelayMs={obsDelayMs}
        onPickDelay={setObsDelayMs}
        obsBackground={obsBackground}
        onPickBackground={setObsBackground}
        isTouch={isTouch}
      />
    </InWindow>
  );
};

export const ObsSettingsEntry = () => (
  <Entry
    slug="vue-obs"
    components={["ObsSettings"]}
    file="ui/obs/obs-settings.tsx"
    note="Pour le streamer : l'adresse, la marche à suivre, le délai, et le fond de la vue, Transparent, Noir ou Blanc."
  >
    <Block title="États">
      <StateRow
        name="L'adresse, la marche à suivre, le délai et le fond"
        detail="Un réglage, la valeur actuelle est toujours choisie."
      >
        <ObsSettingsScene />
      </StateRow>
    </Block>
  </Entry>
);

type ResizeRowProps = { name: string; detail?: string; size: SizeChoice; isFailing?: boolean };

// Confirmer montre le verrou, puis la fenêtre se ferme ; « Connexion perdue » la garde ouverte avec son message.
const ResizeRow = ({ name, detail, size, isFailing = false }: ResizeRowProps) => {
  const [status, setStatus] = useState<ResizeStatus>("idle");
  const next = toCanvasSize(size);
  const outside = SAMPLE_DRAWING.filter(({ x, y }) => x >= next.width || y >= next.height);
  return (
    <StateRow name={name} detail={detail}>
      <OpenWindow onOpen={() => setStatus(isFailing ? "failed" : "idle")}>
        {({ isOpen, close }) => (
          <ResizeWindow
            next={isOpen ? next : null}
            outside={outside}
            status={status}
            canvas={SAMPLE_CANVAS}
            onConfirm={() => {
              setStatus("running");
              setTimeout(close, LOCKED_MS);
            }}
            onClose={close}
          />
        )}
      </OpenWindow>
    </StateRow>
  );
};

export const ResizeWindowEntry = () => (
  <Entry
    slug="taille-du-canvas"
    components={["ResizeWindow"]}
    file="ui/canvas/canvas-settings.tsx"
    note={DIALOG_NOTE}
  >
    <Block title="États">
      <ResizeRow name="Des pixels sortent du cadre" size={{ format: "1:1", sizeIndex: 1 }} />
      <ResizeRow name="Aucun pixel ne sort du cadre" size={{ format: "1:1", sizeIndex: 2 }} />
      <ResizeRow name="Connexion perdue" size={{ format: "1:1", sizeIndex: 1 }} isFailing />
    </Block>
  </Entry>
);

export const CeilingWindowEntry = () => (
  <Entry
    slug="jauge-maximale"
    components={["CeilingWindow"]}
    file="ui/canvas/canvas-settings.tsx"
    note={DIALOG_NOTE}
  >
    <Block title="États">
      <StateRow name="Baisser la jauge maximale">
        <OpenWindow>
          {({ isOpen, close }) => (
            <CeilingWindow
              next={isOpen ? { gaugeMaxStart: GAUGE_MAX_START, gaugeMaxCeiling: 50 } : null}
              onConfirm={close}
              onClose={close}
            />
          )}
        </OpenWindow>
      </StateRow>
    </Block>
  </Entry>
);

// Les réglages du streamer : les sections Canvas (avec le fond de la fresque, Écart §9.1 JOURNAL 2026-10-10) et Vue OBS de la
// fenêtre, et les confirmations de la taille et de la jauge maximale. Les vrais composants du jeu, avec des props d'exemple.

import {
  GAUGE_MAX_CEILING,
  GAUGE_MAX_START,
  type GaugeLimits,
  type ObsBackground,
  toTheme,
} from "@liveplace/domain";
import { useState } from "react";
import {
  type BackgroundField,
  type BackgroundImageField,
  BackgroundImageSettings,
  BackgroundSettings,
  CanvasSettings,
  CeilingWindow,
  GaugeSettings,
  type ResizeStatus,
  ResizeWindow,
  type ThemeField,
  ThemeSettings,
} from "../canvas/canvas-settings";
import { type SizeChoice, toCanvasSize } from "../canvas/canvas-size";
import { BackgroundPreview } from "../design/background-preview";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { ObsSettings } from "../obs/obs-settings";
import { SAMPLE_CANVAS, SAMPLE_DRAWING } from "./design-fixtures";
import { Block, DIALOG_NOTE, Entry, InWindow, OpenWindow, StateRow } from "./entry-layout";
import sampleBackgroundUrl from "./sample-background.svg?url";

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

// Le fond de la fresque : un choix qui se fait.
const useBackgroundDemo = (initial: ObsBackground): BackgroundField => {
  const [value, setValue] = useState(initial);
  const isTouch = useMediaQuery(COMPACT_SCREEN_QUERY);
  return { value, isTouch, onPick: setValue };
};

// L'image de la fresque : une image « choisie » et « retirée » pour de faux (aucun fichier ne part), un curseur qui bouge, et une
// vignette qui montre l'image sur le fond choisi.
const useImageDemo = (
  background: ObsBackground,
  hasImage: boolean,
  opacity: number,
  isSending = false,
): BackgroundImageField => {
  const [hasPicture, setHasPicture] = useState(hasImage);
  const [chosen, setChosen] = useState(opacity);
  return {
    imageUrl: hasPicture ? sampleBackgroundUrl : null,
    background,
    opacity: chosen,
    isSending,
    onChooseFile: () => setHasPicture(true),
    onClearImage: () => setHasPicture(false),
    onPickOpacity: setChosen,
  };
};

type BackgroundSceneProps = { initial: ObsBackground };

const BackgroundScene = ({ initial }: BackgroundSceneProps) => {
  const background = useBackgroundDemo(initial);
  return (
    <InWindow>
      <BackgroundSettings background={background} />
    </InWindow>
  );
};

type ImageSceneProps = {
  background: ObsBackground;
  hasImage?: boolean;
  opacity?: number;
  isSending?: boolean;
};

// L'image seule, sur un fond donné : la vignette le montre sous l'image.
const ImageScene = ({ background, hasImage = true, opacity = 40, isSending = false }: ImageSceneProps) => {
  const image = useImageDemo(background, hasImage, opacity, isSending);
  return (
    <InWindow>
      <BackgroundImageSettings image={image} />
    </InWindow>
  );
};

// La vignette seule, sur chacun des trois fonds : plus l'opacité est basse, plus le fond se voit à travers.
const PREVIEW_BACKGROUNDS = [
  ["transparent", "le damier"],
  ["black", "le noir"],
  ["white", "le blanc"],
] as const;

const PreviewsScene = ({ opacity }: { opacity: number }) => (
  <InWindow>
    <div className="lp-bg-image-row">
      {PREVIEW_BACKGROUNDS.map(([background, name]) => (
        <BackgroundPreview
          key={background}
          imageUrl={sampleBackgroundUrl}
          background={background}
          opacity={opacity}
          label={`Vignette sur ${name}, à ${opacity} %`}
        />
      ))}
    </div>
  </InWindow>
);

// Le fond puis l'image, ensemble : choisir un autre fond change celui de la vignette.
const BackgroundAndImageScene = () => {
  const background = useBackgroundDemo("transparent");
  const image = useImageDemo(background.value, true, 40);
  return (
    <InWindow>
      <BackgroundSettings background={background} />
      <BackgroundImageSettings image={image} />
    </InWindow>
  );
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
  const background = useBackgroundDemo("transparent");
  const image = useImageDemo(background.value, false, 40);
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
          background={background}
          image={image}
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
    components={[
      "CanvasSettings",
      "ThemeSettings",
      "BackgroundSettings",
      "BackgroundImageSettings",
      "GaugeSettings",
    ]}
    file="ui/canvas/canvas-settings.tsx"
    note="Pour le streamer : le thème de la fresque, qui s'enregistre quand le champ perd le focus, son fond (Transparent, Noir ou Blanc), son image avec son opacité, la taille de la fresque, sans rien perdre, et la jauge de ses joueurs (masquée dans le jeu pour l'instant)."
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
      <StateRow
        name="Le fond de la fresque, Transparent"
        detail="Le damier reste dans le jeu, la vue OBS reste transparente. Un seul choix à la fois."
      >
        <BackgroundScene initial="transparent" />
      </StateRow>
      <StateRow
        name="Le fond de la fresque, Noir"
        detail="Les cases vides du jeu prennent cette couleur, comme la vue OBS."
      >
        <BackgroundScene initial="black" />
      </StateRow>
      <StateRow
        name="Le fond de la fresque, Blanc"
        detail="Les cases vides du jeu prennent cette couleur, comme la vue OBS."
      >
        <BackgroundScene initial="white" />
      </StateRow>
      <StateRow
        name="L'image de la fresque, sans image"
        detail="Un seul bouton demande le fichier : PNG, JPEG ou WebP, réduit à 2048 px, 2 Mo au plus. Ni vignette, ni curseur."
      >
        <ImageScene background="transparent" hasImage={false} />
      </StateRow>
      <StateRow
        name="L'image de la fresque, sur le damier, à 40 %"
        detail="La vignette montre l'image par-dessus le fond choisi, et suit le curseur pendant qu'on le fait glisser ; l'opacité part au relâchement."
      >
        <ImageScene background="transparent" opacity={40} />
      </StateRow>
      <StateRow name="L'image de la fresque, sur le noir, à 40 %">
        <ImageScene background="black" opacity={40} />
      </StateRow>
      <StateRow name="L'image de la fresque, sur le blanc, à 80 %">
        <ImageScene background="white" opacity={80} />
      </StateRow>
      <StateRow
        name="La vignette de l'image, à 40 % puis à 90 %"
        detail="Sur le damier, le noir et le blanc : plus l'opacité est basse, plus le fond se voit à travers."
      >
        <PreviewsScene opacity={40} />
        <PreviewsScene opacity={90} />
      </StateRow>
      <StateRow name="L'image part" detail="Les deux boutons attendent la réponse.">
        <ImageScene background="transparent" isSending />
      </StateRow>
      <StateRow
        name="Le fond et son image, ensemble"
        detail="N'importe quel fond avec une image : choisir un autre fond change celui de la vignette."
      >
        <BackgroundAndImageScene />
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
  return (
    <InWindow>
      <ObsSettings
        address="liveplace.tv/kalyss"
        url="https://liveplace.tv/kalyss"
        obsDelayMs={obsDelayMs}
        onPickDelay={setObsDelayMs}
      />
    </InWindow>
  );
};

export const ObsSettingsEntry = () => (
  <Entry
    slug="vue-obs"
    components={["ObsSettings"]}
    file="ui/obs/obs-settings.tsx"
    note="Pour le streamer : l'adresse, la marche à suivre et le délai. Le fond de la vue se règle dans la section Fresque."
  >
    <Block title="États">
      <StateRow
        name="L'adresse, la marche à suivre et le délai"
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

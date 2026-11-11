// Le GIF de la fresque (JOURNAL 2026-11-11), outil du développeur : son bouton, la barre de progression et les états de sa fenêtre.

import { useState } from "react";
import { ProgressBar } from "../design/progress-bar";
import { createGifWriter, type Rgb } from "../developer/gif-writer";
import { TimelapseButton } from "../developer/timelapse-button";
import { TIMELAPSE_START, type TimelapseState } from "../developer/timelapse-run";
import { TimelapseBody } from "../developer/timelapse-window";
import { noop } from "./design-fixtures";
import { Block, Entry, InLargeWindow, StateRow } from "./entry-layout";

const SAMPLE_PALETTE: readonly Rgb[] = [
  [228, 226, 231],
  [236, 39, 63],
  [51, 136, 222],
  [243, 168, 51],
];
const SAMPLE_CELL = 10;

// Un petit GIF d'exemple, de grands pixels : 16 × 10 cases, en `data:` (le rendu serveur n'a pas d'URL de blob).
const sampleGifUrl = (): string => {
  const [width, height] = [16 * SAMPLE_CELL, 10 * SAMPLE_CELL];
  const writer = createGifWriter({ width, height, palette: SAMPLE_PALETTE });
  const indexes = Uint8Array.from({ length: width * height }, (_, at) => {
    const [x, y] = [Math.floor((at % width) / SAMPLE_CELL), Math.floor(at / width / SAMPLE_CELL)];
    return x === y || x + y === 15 ? 1 + ((x + y) % 3) : 0;
  });
  writer.addFrame({ left: 0, top: 0, width, height, indexes, delayCs: 100 });
  return `data:image/gif;base64,${btoa(String.fromCharCode(...writer.finish()))}`;
};

const STATES: readonly { name: string; detail: string; state: (url: string) => TimelapseState }[] = [
  {
    name: "Lecture de l'historique",
    detail:
      "Avant la première ligne du serveur : une barre qui ne dit pas où elle en est, et les secondes qui courent.",
    state: () => TIMELAPSE_START,
  },
  {
    name: "Flux Redis",
    detail: "Le flux est lu : ses poses, au format français. La barre ne dit toujours pas où elle en est.",
    state: () => ({ kind: "reading", seconds: 3, poses: 1104, chunks: null }),
  },
  {
    name: "Chunks Convex : 12 sur 140",
    detail:
      "Les chunks que le flux n'a plus : la ligne du flux reste au-dessus, la barre avance chunk après chunk.",
    state: () => ({ kind: "reading", seconds: 12, poses: 1104, chunks: { done: 12, total: 140 } }),
  },
  {
    name: "Image 312 sur 840",
    detail:
      "Le Web Worker dessine et encode : la barre avance image après image, les secondes continuent. Fermer la fenêtre arrête tout.",
    state: () => ({ kind: "drawing", seconds: 45, done: 312, total: 840 }),
  },
  {
    name: "Aperçu",
    detail:
      "Le GIF aux pixels nets, sa durée, sa taille et son poids, et un seul bouton plein : Télécharger.",
    state: (url) => ({
      kind: "ready",
      url,
      fileName: "liveplace-fenysk-2026-11-11.gif",
      summary: "32 s · 630×504 · 2,4 Mo",
    }),
  },
  {
    name: "Aucun dessin",
    detail: "Rien à animer : recommencer n'y changerait rien, pas de Réessayer.",
    state: () => ({ kind: "failed", reason: "noChanges" }),
  },
  {
    name: "Historique trop long",
    detail: "Plus de changements que la limite : pas de Réessayer.",
    state: () => ({ kind: "failed", reason: "tooManyChanges" }),
  },
  {
    name: "Un fichier sans réponse",
    detail: "Un fichier de l'historique n'a pas répondu deux fois : le message le dit, et Réessayer.",
    state: () => ({ kind: "failed", reason: "historyTimeout" }),
  },
  {
    name: "Connexion coupée",
    detail: "Le flux s'est fermé avant la fin (réseau, serveur redémarré) : le message le dit, et Réessayer.",
    state: () => ({ kind: "failed", reason: "disconnected" }),
  },
  {
    name: "Serveur silencieux",
    detail: "Aucun octet pendant 60 s : la requête est annulée, le message le dit, et Réessayer.",
    state: () => ({ kind: "failed", reason: "silent" }),
  },
  {
    name: "Échec",
    detail: "Le reste : le message général et Réessayer.",
    state: () => ({ kind: "failed", reason: "failed" }),
  },
];

export const TimelapseEntry = () => {
  const [url] = useState(sampleGifUrl);
  return (
    <Entry
      slug="gif-de-la-fresque"
      components={["TimelapseButton", "ProgressBar", "TimelapseWindow"]}
      file="ui/developer/{timelapse-button,timelapse-window}.tsx · ui/design/progress-bar.tsx"
      note="Réservé au développeur, en français comme la fenêtre Développeur. Le bouton est sur la pill Canvas d'une fresque d'autre, dans le bandeau d'une archive, et dans la pill Compte à côté de Développeur sur la sienne ; sur mobile, il disparaît avec la pill Canvas repliée."
    >
      <Block title="Le bouton" hasCount={false}>
        <StateRow
          name="Créer le GIF de la fresque"
          detail="Une icône seule, en ghost : le titre est son nom."
        >
          <TimelapseButton onPress={noop} />
        </StateRow>
        <StateRow name="La barre de progression" detail="Un `<progress>` natif, la part faite à l'encre.">
          <ProgressBar label="Image 3 sur 5" value={3} max={5} />
        </StateRow>
      </Block>
      <Block title="La fenêtre">
        {STATES.map(({ name, detail, state }) => (
          <StateRow key={name} name={name} detail={detail}>
            <InLargeWindow>
              <div className="lp-timelapse">
                <TimelapseBody state={state(url)} onRetry={noop} />
              </div>
            </InLargeWindow>
          </StateRow>
        ))}
      </Block>
    </Entry>
  );
};

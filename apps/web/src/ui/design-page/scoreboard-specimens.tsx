// Le classement dans chacun de ses états (JOURNAL 2026-10-06) : la colonne du PC, déplié et replié, et la liste de la
// fenêtre sur mobile. Les vrais composants, avec des données factices : on survole un avatar pour son étiquette.

import type { ScoreboardEntry } from "@liveplace/domain/ports";
import { useState } from "react";
import type { Scoreboard } from "../../state/canvas-store";
import { toScoreboardRows } from "../../state/scoreboard";
import { Button } from "../design/button";
import { ScoreboardList } from "../scoreboard/scoreboard-list";
import { ScoreboardPill } from "../scoreboard/scoreboard-pill";
import { noop, SAMPLE_PLAYER, SAMPLE_SCOREBOARD_TOP } from "./design-fixtures";
import { Specimen, SpecimenSection } from "./specimen-section";

const top = [...SAMPLE_SCOREBOARD_TOP];

type PillSpecimen = { caption: string; scoreboard: Scoreboard; isCollapsed: boolean };

const PILL_SPECIMENS: readonly PillSpecimen[] = [
  {
    caption: "Déplié : l'avatar, le pseudo et les pixels ; l'ordre et les anneaux disent le rang",
    scoreboard: { top },
    isCollapsed: false,
  },
  {
    caption: "Déplié, dans le top : ma ligne teintée à sa place, avec l'anneau de podium seul",
    scoreboard: { top, you: { rank: 3, pixels: 640 } },
    isCollapsed: false,
  },
  {
    caption: "Déplié, hors du top : ma place à part, mon rang sous mon pseudo",
    scoreboard: { top, you: { rank: 12, pixels: 37 } },
    isCollapsed: false,
  },
  {
    caption: "Replié : la pile, chaque avatar avec son rang en indice ; l'étiquette au survol",
    scoreboard: { top, you: { rank: 3, pixels: 640 } },
    isCollapsed: true,
  },
  {
    caption: "Replié, hors du top",
    scoreboard: { top, you: { rank: 12, pixels: 37 } },
    isCollapsed: true,
  },
  {
    caption: "Un seul joueur a posé",
    scoreboard: { top: top.slice(0, 1), you: { rank: 1, pixels: 1204 } },
    isCollapsed: false,
  },
];

// Le vrai contrôle : replier et déplier se voient, comme dans le jeu.
const PillSpecimenView = ({ scoreboard, isCollapsed: initial }: Omit<PillSpecimen, "caption">) => {
  const [isCollapsed, setIsCollapsed] = useState(initial);
  return (
    <ScoreboardPill
      rows={toScoreboardRows(scoreboard, SAMPLE_PLAYER)}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed((collapsed) => !collapsed)}
      isDocked={false}
    />
  );
};

// Le quatrième passe devant le deuxième : les avatars glissent à leur nouvelle place.
const overtake = (entries: readonly ScoreboardEntry[]): ScoreboardEntry[] => {
  const second = entries[1];
  const fourth = entries[3];
  if (!second || !fourth) return [...entries];
  return entries
    .map((entry) => (entry === fourth ? { ...entry, pixels: second.pixels + 1 } : entry))
    .sort((left, right) => right.pixels - left.pixels);
};

const GlideSpecimen = () => {
  const [entries, setEntries] = useState<readonly ScoreboardEntry[]>(top);
  return (
    <Specimen caption="Les avatars glissent quand quelqu'un en double un autre (hors mouvement réduit)">
      <div className="design-demo-buttons">
        <ScoreboardPill
          rows={toScoreboardRows({ top: [...entries] }, SAMPLE_PLAYER)}
          isCollapsed={false}
          onToggle={noop}
          isDocked={false}
        />
        <Button label="Doubler" onPress={() => setEntries(overtake)} />
      </div>
    </Specimen>
  );
};

const LIST_SPECIMENS: readonly { caption: string; scoreboard: Scoreboard }[] = [
  {
    caption: "Hors du top : le top 5, puis ma place à part",
    scoreboard: { top, you: { rank: 12, pixels: 37 } },
  },
  { caption: "Dans le top : ma ligne teintée", scoreboard: { top, you: { rank: 3, pixels: 640 } } },
];

export const ScoreboardSpecimens = () => (
  <>
    <SpecimenSection
      title="Classement"
      note="Au centre à gauche, sur PC seulement, jamais en vue OBS. Un clic sur un avatar ne fait rien ; replié, le survol donne l'étiquette."
    >
      {PILL_SPECIMENS.map(({ caption, ...specimen }) => (
        <Specimen key={caption} caption={caption}>
          <PillSpecimenView {...specimen} />
        </Specimen>
      ))}
      <GlideSpecimen />
    </SpecimenSection>

    <SpecimenSection
      title="Fenêtre, section Classement"
      note="Sur mobile seulement : la même liste, sans survol, dans la fenêtre."
    >
      {LIST_SPECIMENS.map(({ caption, scoreboard }) => (
        <Specimen key={caption} caption={caption}>
          <div className="design-window-box">
            <ScoreboardList rows={toScoreboardRows(scoreboard, SAMPLE_PLAYER)} />
          </div>
        </Specimen>
      ))}
    </SpecimenSection>
  </>
);

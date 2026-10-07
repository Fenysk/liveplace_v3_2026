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
import { Block, Entry, InPhone, StateRow, WithValue } from "./entry-layout";

const top = [...SAMPLE_SCOREBOARD_TOP];

type ScoreboardScene = { name: string; detail?: string; scoreboard: Scoreboard };

const UNFOLDED_SCENES: readonly ScoreboardScene[] = [
  {
    name: "Le classement",
    detail: "L'avatar, le pseudo et les pixels ; l'ordre et les anneaux disent le rang.",
    scoreboard: { top },
  },
  {
    name: "Dans le top",
    detail: "Ma ligne teintée à sa place, avec l'anneau de podium seul.",
    scoreboard: { top, you: { rank: 3, pixels: 640 } },
  },
  {
    name: "Hors du top",
    detail: "Ma place à part, mon rang sous mon pseudo.",
    scoreboard: { top, you: { rank: 12, pixels: 37 } },
  },
  {
    name: "Un seul joueur a posé",
    scoreboard: { top: top.slice(0, 1), you: { rank: 1, pixels: 1204 } },
  },
];

const FOLDED_SCENES: readonly ScoreboardScene[] = [
  {
    name: "La pile",
    detail: "Chaque avatar avec son rang en indice ; l'étiquette au survol.",
    scoreboard: { top, you: { rank: 3, pixels: 640 } },
  },
  { name: "Hors du top", scoreboard: { top, you: { rank: 12, pixels: 37 } } },
];

// Le vrai contrôle : replier et déplier se voient, comme dans le jeu.
const PillScene = ({
  scoreboard,
  isCollapsed: initial,
}: {
  scoreboard: Scoreboard;
  isCollapsed: boolean;
}) => (
  <WithValue initial={initial}>
    {(isCollapsed, setIsCollapsed) => (
      <ScoreboardPill
        rows={toScoreboardRows(scoreboard, SAMPLE_PLAYER)}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
        isDocked={false}
      />
    )}
  </WithValue>
);

// Le quatrième passe devant le deuxième : les avatars glissent à leur nouvelle place.
const overtake = (entries: readonly ScoreboardEntry[]): ScoreboardEntry[] => {
  const second = entries[1];
  const fourth = entries[3];
  if (!second || !fourth) return [...entries];
  return entries
    .map((entry) => (entry === fourth ? { ...entry, pixels: second.pixels + 1 } : entry))
    .sort((left, right) => right.pixels - left.pixels);
};

const GlideScene = () => {
  const [entries, setEntries] = useState<readonly ScoreboardEntry[]>(top);
  return (
    <div className="lp-row">
      <ScoreboardPill
        rows={toScoreboardRows({ top: [...entries] }, SAMPLE_PLAYER)}
        isCollapsed={false}
        onToggle={noop}
        isDocked={false}
      />
      <Button label="Doubler" onPress={() => setEntries(overtake)} />
    </div>
  );
};

export const ScoreboardPillEntry = () => (
  <Entry
    slug="pill-classement"
    components={["ScoreboardPill"]}
    file="ui/scoreboard/scoreboard-pill.tsx"
    note="Jamais en vue OBS. Un clic sur un avatar ne fait rien ; replié, le survol donne l'étiquette."
    where="Au centre à gauche · sur PC seulement"
  >
    <Block title="Déplié">
      {UNFOLDED_SCENES.map(({ name, detail, scoreboard }) => (
        <StateRow key={name} name={name} detail={detail}>
          <PillScene scoreboard={scoreboard} isCollapsed={false} />
        </StateRow>
      ))}
      <StateRow
        name="Les avatars glissent"
        detail="Quand quelqu'un en double un autre (hors mouvement réduit)."
        isDemo
      >
        <GlideScene />
      </StateRow>
    </Block>
    <Block title="Replié">
      {FOLDED_SCENES.map(({ name, detail, scoreboard }) => (
        <StateRow key={name} name={name} detail={detail}>
          <PillScene scoreboard={scoreboard} isCollapsed />
        </StateRow>
      ))}
    </Block>
  </Entry>
);

const LIST_SCENES: readonly ScoreboardScene[] = [
  {
    name: "Hors du top",
    detail: "Le top 5, puis ma place à part.",
    scoreboard: { top, you: { rank: 12, pixels: 37 } },
  },
  { name: "Dans le top", detail: "Ma ligne teintée.", scoreboard: { top, you: { rank: 3, pixels: 640 } } },
];

export const ScoreboardListEntry = () => (
  <Entry
    slug="fenetre-classement"
    components={["ScoreboardList"]}
    file="ui/scoreboard/scoreboard-list.tsx"
    note="La même liste, sans survol, dans la fenêtre."
    where="Sur mobile seulement"
  >
    <Block title="États">
      {LIST_SCENES.map(({ name, detail, scoreboard }) => (
        <StateRow key={name} name={name} detail={detail}>
          <InPhone isWindow>
            <ScoreboardList rows={toScoreboardRows(scoreboard, SAMPLE_PLAYER)} />
          </InPhone>
        </StateRow>
      ))}
    </Block>
  </Entry>
);

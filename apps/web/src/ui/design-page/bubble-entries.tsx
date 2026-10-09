// L'entrée Bulle (Écart §8.1, JOURNAL 2026-10-08) : la surface qui guide un geste, sans cible, avec une flèche, et portant
// la progression du conseil de première visite.

import { Brush, Eraser, Pipette, Pointer, Trash } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HINT_STEPS } from "../../state/first-hint";
import { Bubble, BubbleLine } from "../design/bubble";
import { Button } from "../design/button";
import { Pill } from "../design/pill";
import { DraftPill } from "../draft/draft-pill";
import { HELP_TEXTS } from "../help/help-texts";
import { FirstHint } from "../hint/first-hint";
import { HINT_CLOSE_BEAT_MS } from "../hint/first-hint-props";
import { noop } from "./design-fixtures";
import { Block, Entry, InLandscape, InPhone, StateRow, useNowMs } from "./entry-layout";
import { DRAFT_ACTIONS, gaugeAt } from "./game-entries";
import { HelpBubbleBlocks } from "./help-bubble-entries";

// Une bulle au-dessus de ce qu'elle accompagne, centrée : la place qu'elle a dans le jeu. Sa flèche porte déjà l'espace.
const Stack = ({ isAimed = false, children }: { isAimed?: boolean; children: ReactNode }) => (
  <div className={isAimed ? "design-bubble-stack design-bubble-stack--aimed" : "design-bubble-stack"}>
    {children}
  </div>
);

const TOOLS = [
  { name: "eraser", icon: Eraser, title: "Gomme" },
  { name: "picker", icon: Pipette, title: "Pipette" },
  { name: "brush", icon: Brush, title: "Tracé" },
  { name: "trash", icon: Trash, title: "Vider le brouillon" },
] as const;

type ToolName = (typeof TOOLS)[number]["name"];

// La rangée d'outils de la feuille Dessin, avec une bulle qui en vise un : la flèche suit la cible, où qu'elle soit.
const AimedTool = ({ aimed }: { aimed: ToolName }) => {
  const target = useRef<HTMLSpanElement>(null);
  return (
    <Stack isAimed>
      <Bubble isVisible isDocked={false} target={target}>
        <BubbleLine icon={Brush}>{HELP_TEXTS.fr.trace}</BubbleLine>
      </Bubble>
      <Pill>
        {TOOLS.map(({ name, icon, title }) => (
          <span key={name} ref={name === aimed ? target : undefined}>
            <Button icon={icon} variant="ghost" title={title} onPress={noop} />
          </span>
        ))}
      </Pill>
    </Stack>
  );
};

const BarScene = () => {
  const nowMs = useNowMs();
  return (
    <Stack>
      <FirstHint doneCount={1} isVisible isDocked={false} />
      <InPhone>
        <DraftPill
          state={{ kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: false }}
          actions={DRAFT_ACTIONS}
          isCompact
          isDocked={false}
        />
      </InPhone>
    </Stack>
  );
};

// En paysage, la colonne contre le bord droit : le conseil se pose au bas de ce qu'elle laisse au canvas, pas au-dessus d'elle.
const BesideColumnScene = () => {
  const nowMs = useNowMs();
  return (
    <div className="design-bubble-row design-bubble-row--end">
      <FirstHint doneCount={1} isVisible isDocked={false} />
      <InLandscape>
        <DraftPill
          state={{ kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: false }}
          actions={DRAFT_ACTIONS}
          isCompact
          isSidePanel
          isDocked={false}
        />
      </InLandscape>
    </div>
  );
};

// Les points se remplissent un à un ; le dernier reste rempli deux secondes, puis la bulle s'efface en fondu.
const HintDemo = () => {
  const [doneCount, setDoneCount] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const isFinished = doneCount === HINT_STEPS.length;
  useEffect(() => {
    if (!isFinished) return;
    const timer = setTimeout(() => setIsVisible(false), HINT_CLOSE_BEAT_MS);
    return () => clearTimeout(timer);
  }, [isFinished]);
  const advance = () => {
    if (isVisible) {
      setDoneCount(doneCount + 1);
      return;
    }
    setDoneCount(0);
    setIsVisible(true);
  };
  return (
    <Stack>
      <FirstHint doneCount={doneCount} isVisible={isVisible} isDocked={false} />
      <Button
        label={isVisible ? "Un geste de plus" : "Recommencer"}
        isDisabled={isFinished && isVisible}
        onPress={advance}
      />
    </Stack>
  );
};

const HINT_STATES: readonly { name: string; detail?: string; doneCount: number }[] = [
  {
    name: "Première visite",
    detail:
      "Deux lignes, trois points : un point par geste distinct réussi (déplacer, pincer, toucher un pixel).",
    doneCount: 0,
  },
  { name: "Un geste fait", doneCount: 1 },
  { name: "Deux gestes faits", doneCount: 2 },
  {
    name: "Les trois gestes faits",
    detail:
      "Le dernier point reste rempli deux secondes, puis la bulle s'efface en fondu et ne revient plus. Cachée au troisième geste (Dessin, inspection), elle montre le dernier point à son retour, puis attend ces deux secondes.",
    doneCount: 3,
  },
];

export const BubbleEntry = () => (
  <Entry
    slug="bulle"
    components={["Bubble", "BubbleLine", "FirstHint"]}
    file="ui/design/bubble.tsx, ui/hint/first-hint.tsx"
    note="Une surface de pill sans action, qui guide un geste : un contenu libre, une ou plusieurs lignes avec leur icône. Elle ne se montre qu'une fois, retenue par clé dans le navigateur ; sans stockage, elle ne s'affiche pas. Le doigt la traverse."
    where="Au-dessus de la barre du bas, ou au-dessus de l'élément qu'elle vise"
  >
    <Block title="Sans cible">
      <StateRow
        name="Une ligne"
        detail="Sans cible, elle se pose au-dessus de la barre du bas, centrée. Elle paraît et s'efface en fondu."
      >
        <Bubble isVisible isDocked={false}>
          <BubbleLine icon={Pointer}>Touche un pixel pour voir qui l'a posé</BubbleLine>
        </Bubble>
      </StateRow>
      <StateRow
        name="Au-dessus de la barre du bas"
        detail="La hauteur de la barre est mesurée : la bulle reste au-dessus, quelle qu'elle soit."
      >
        <BarScene />
      </StateRow>
      <StateRow
        name="À côté de la colonne"
        detail="En paysage, la barre du bas est une colonne à droite : la bulle se pose au bas de la zone du canvas, à sa gauche."
      >
        <BesideColumnScene />
      </StateRow>
    </Block>
    <Block title="Avec flèche">
      <StateRow
        name="Elle pointe le pinceau"
        detail="Au-dessus de l'élément visé, centrée sur lui, la flèche vers lui."
      >
        <AimedTool aimed="brush" />
      </StateRow>
      <StateRow
        name="Elle pointe la gomme"
        detail="La flèche suit la cible : la bulle reste centrée, la flèche glisse sur son bord."
      >
        <AimedTool aimed="eraser" />
      </StateRow>
    </Block>
    <Block title="Avec progression">
      {HINT_STATES.map(({ name, detail, doneCount }) => (
        <StateRow key={name} name={name} detail={detail}>
          <FirstHint doneCount={doneCount} isVisible isDocked={false} />
        </StateRow>
      ))}
      <StateRow
        name="Les points se remplissent"
        detail="Le conseil de première visite : sur écran tactile, jamais en vue OBS, caché en Dessin et pendant l'inspection."
        isDemo
      >
        <HintDemo />
      </StateRow>
    </Block>
    <HelpBubbleBlocks />
  </Entry>
);

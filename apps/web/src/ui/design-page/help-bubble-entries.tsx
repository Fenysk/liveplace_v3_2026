// Les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) dans l'entrée Bulle : chacune sur la vraie pill qu'elle désigne, avec
// sa flèche, puis les côtés d'où une bulle vise sa cible. Les mêmes textes et les mêmes cibles que dans le jeu. Les deux de la
// chaîne OBS vivent dans la fenêtre (JOURNAL 2026-10-09) : leur bloc montre l'onglet et l'adresse tels que la fenêtre les pose.

import { Eraser, MonitorPlay, Pipette, Scaling, Trash, User } from "lucide-react";
import { type ReactNode, type RefObject, useRef } from "react";
import type { Refill } from "../../state/gauge";
import type { HelpBubble } from "../../state/help-bubbles";
import { AccountPill } from "../account/account-pill";
import { wrapObsTab } from "../account/account-window";
import { Bubble, BubbleLine } from "../design/bubble";
import type { BubbleSide } from "../design/bubble-position";
import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { Pill } from "../design/pill";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { WindowNav } from "../design/window";
import { DraftPill, type DraftPillState } from "../draft/draft-pill";
import { BubbleTargetsContext, useBubbleTargets } from "../help/bubble-target";
import { HelpBubbleLine, helpTargetOf } from "../help/help-bubbles";
import { ObsAddress } from "../obs/obs-settings";
import { noop } from "./design-fixtures";
import { Block, InPhone, StateRow, useNowMs } from "./entry-layout";
import { DRAFT_ACTIONS, draftState, gaugeAt, SIGNED_IN } from "./game-entries";

const REFILL: Refill = { refillMs: 10_000, refillCharges: 1 };

type Align = "start" | "center" | "end";

type AimedProps = {
  bubble: HelpBubble;
  side?: BubbleSide;
  align?: Align; // où la bulle se pose dans la largeur : centrée sur la cible, ou collée au bord que la cible approche
  isTouchScreen?: boolean;
  refill?: Refill;
  children: ReactNode;
};

// Une bulle d'aide sur la pill qu'elle désigne : les cibles sont celles de la pill, la flèche suit.
const Aimed = ({
  bubble,
  side = "above",
  align = "center",
  isTouchScreen = true,
  refill = REFILL,
  children,
}: AimedProps) => {
  const targets = useBubbleTargets();
  const line = (
    <Bubble isVisible isDocked={false} side={side} target={targets[helpTargetOf(bubble)]}>
      <HelpBubbleLine bubble={bubble} isTouchScreen={isTouchScreen} refill={refill} />
    </Bubble>
  );
  return (
    <BubbleTargetsContext value={targets}>
      <div
        className={classNames(
          "design-bubble-stack design-bubble-stack--aimed design-bubble-stack--wide",
          `design-bubble-stack--${align}`,
        )}
      >
        {side === "below" ? (
          <>
            {children}
            {line}
          </>
        ) : (
          <>
            {line}
            {children}
          </>
        )}
      </div>
    </BubbleTargetsContext>
  );
};

type AccountScene = { hasSettings?: boolean; hasModeration?: boolean; pendingReports?: number };

const Account = ({ hasSettings = false, hasModeration = false, pendingReports = 0 }: AccountScene) => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <AccountPill
      identity={SIGNED_IN}
      signInHref="#"
      appearanceChoice={appearanceChoice}
      onPickAppearance={pickAppearance}
      onOpenAccount={noop}
      onOpenSettings={hasSettings ? noop : undefined}
      onOpenModeration={hasModeration ? noop : undefined}
      pendingReports={pendingReports}
      isDocked={false}
    />
  );
};

const bar = (state: DraftPillState, isCompact: boolean) => (
  <DraftPill state={state} actions={DRAFT_ACTIONS} isCompact={isCompact} isDocked={false} />
);

type HelpScene = {
  name: string;
  detail: string;
  bubble: HelpBubble;
  side?: BubbleSide;
  align?: Align;
  isTouchScreen?: boolean;
  refill?: Refill;
  isPhone?: boolean; // la barre du bas d'un téléphone, à la largeur de son écran
  content: (nowMs: number) => ReactNode;
};

const viewBar = (charges: number, canClaim: boolean) => (nowMs: number) =>
  bar({ kind: "view", gauge: gaugeAt(nowMs, charges), canClaim }, false);

// Dans l'ordre de priorité : ce qui attend un geste, puis l'état de la personne, puis le Dessin.
const HELP_SCENES: readonly HelpScene[] = [
  {
    name: "Un signalement attend, pour qui modère",
    detail:
      "Flèche sur Modération, qui porte le point. Elle s'efface quand la fenêtre s'ouvre sur Modération.",
    bubble: "pending-report",
    side: "below",
    align: "end",
    content: () => <Account hasModeration pendingReports={1} />,
  },
  {
    name: "Un signalement attend, pour le streamer",
    detail: "Sa photo porte le point : la flèche la vise.",
    bubble: "pending-report",
    side: "below",
    align: "end",
    content: () => <Account hasSettings pendingReports={1} />,
  },
  {
    name: "Le streamer sur sa fresque",
    detail: "Flèche sur Réglages. Elle s'efface quand il ouvre Réglages.",
    bubble: "obs-settings",
    side: "below",
    align: "end",
    content: () => <Account hasSettings />,
  },
  {
    name: "Une récompense attend",
    detail: "Flèche sur le +1. Elle s'efface quand on le touche, ou à l'action suivante.",
    bubble: "first-reward",
    content: viewBar(7, true),
  },
  {
    name: "Jauge vide, la première fois",
    detail: "Les chiffres viennent de la fresque : sa recharge, au singulier.",
    bubble: "empty-gauge",
    align: "start",
    content: viewBar(0, false),
  },
  {
    name: "Jauge vide, plusieurs charges par recharge",
    detail: "Au pluriel, avec le nombre.",
    bubble: "empty-gauge",
    align: "start",
    refill: { refillMs: 30_000, refillCharges: 3 },
    content: viewBar(0, false),
  },
  {
    name: "Un doigt déplace la vue au lieu de dessiner",
    detail:
      "Écran tactile seulement : flèche sur le Tracé, la bulle posée au-dessus de la feuille sans la couvrir.",
    bubble: "draft-trace",
    align: "end",
    isPhone: true,
    content: (nowMs) => bar(draftState(nowMs, { isTouchScreen: true }), true),
  },
  {
    name: "Premier passage en Dessin, au doigt",
    detail:
      "Flèche sur Valider : rien n'est posé avant. Elle s'efface au premier pixel du brouillon, ou en sortant du Dessin. En paysage et sur un pliable déplié, elle se pose à gauche du panneau et la bande Thème s'efface le temps de la bulle.",
    bubble: "first-draft",
    align: "end",
    isPhone: true,
    content: (nowMs) =>
      bar(draftState(nowMs, { isTouchScreen: true, canSubmit: false, canDiscard: false }), true),
  },
  {
    name: "Premier passage en Dessin, à la souris",
    detail: "« Clique » au lieu de « Touche ».",
    bubble: "first-draft",
    align: "end",
    isTouchScreen: false,
    content: (nowMs) => bar(draftState(nowMs, { canSubmit: false, canDiscard: false }), false),
  },
];

// Trois sections de la barre latérale : Vue OBS, celle que la bulle désigne, est au milieu, où la bulle se centre sur elle.
const OBS_SECTIONS = [
  { id: "canvas", label: "Fresque", icon: Scaling },
  { id: "obs", label: "Vue OBS", icon: MonitorPlay },
  { id: "account", label: "Mon compte", icon: User },
] as const;

// L'onglet Vue OBS, dans la barre latérale (PC : la bulle à sa gauche, sur le voile) ou la rangée d'onglets de la feuille (la bulle
// dessous, par-dessus le contenu). Le vrai composant des onglets, et la vraie cible.
const TabScene = ({ side }: { side: "left" | "below" }) => {
  const targets = useBubbleTargets();
  const nav = (
    <div className={classNames("lp-pill", side === "left" ? "design-nav-column" : "design-nav-row")}>
      <WindowNav sections={OBS_SECTIONS} currentId="canvas" onSelect={noop} wrapTab={wrapObsTab} />
    </div>
  );
  const line = (
    <Bubble isVisible isDocked={false} side={side} target={targets["obs-tab"]}>
      <HelpBubbleLine bubble="obs-tab" isTouchScreen={false} refill={REFILL} />
    </Bubble>
  );
  return (
    <BubbleTargetsContext value={targets}>
      {side === "left" ? (
        <div className="design-bubble-row design-bubble-row--middle">
          {line}
          {nav}
        </div>
      ) : (
        <div className="design-bubble-stack design-bubble-stack--aimed">
          {nav}
          {line}
        </div>
      )}
    </BubbleTargetsContext>
  );
};

// L'adresse à coller dans OBS, dans la section Vue OBS : la bulle au-dessus du champ qui se copie.
const AddressScene = () => (
  <Aimed bubble="obs-address">
    <div className="lp-pill design-in-window">
      <div className="lp-setting">
        <ObsAddress address="liveplace.tv/kalyss" url="https://liveplace.tv/kalyss" />
      </div>
    </div>
  </Aimed>
);

const HelpSceneRow = ({ scene, nowMs }: { scene: HelpScene; nowMs: number }) => {
  const { name, detail, isPhone, content, ...aimed } = scene;
  const aimedPill = <Aimed {...aimed}>{content(nowMs)}</Aimed>;
  return (
    <StateRow name={name} detail={detail}>
      {isPhone ? <InPhone>{aimedPill}</InPhone> : aimedPill}
    </StateRow>
  );
};

const TOOLS = [
  { icon: Eraser, title: "Gomme" },
  { icon: Pipette, title: "Pipette" },
  { icon: Trash, title: "Vider le brouillon" },
] as const;

// Des boutons dans une pill, le premier visé : en rangée ou en colonne.
const Tools = ({ target, layout }: { target: RefObject<HTMLSpanElement | null>; layout?: "rail" }) => (
  <Pill layout={layout}>
    {TOOLS.map(({ icon, title }, index) => (
      <span key={title} ref={index === 0 ? target : undefined}>
        <Button icon={icon} variant="ghost" title={title} onPress={noop} />
      </span>
    ))}
  </Pill>
);

// Une colonne de boutons, avec une bulle à sa gauche ou à sa droite : la barre du bas en paysage (colonne à droite).
const Beside = ({ side }: { side: "left" | "right" }) => {
  const target = useRef<HTMLSpanElement>(null);
  const line = (
    <Bubble isVisible isDocked={false} side={side} target={target}>
      <BubbleLine icon={Eraser}>La bulle se pose du côté où elle tient</BubbleLine>
    </Bubble>
  );
  const column = <Tools target={target} layout="rail" />;
  return (
    <div className="design-bubble-row">
      {side === "left" ? (
        <>
          {line}
          {column}
        </>
      ) : (
        <>
          {column}
          {line}
        </>
      )}
    </div>
  );
};

const Below = () => {
  const target = useRef<HTMLSpanElement>(null);
  return (
    <div className="design-bubble-stack design-bubble-stack--aimed">
      <Tools target={target} />
      <Bubble isVisible isDocked={false} side="below" target={target}>
        <BubbleLine icon={Eraser}>Sans place au-dessus, elle passe dessous</BubbleLine>
      </Bubble>
    </div>
  );
};

export const HelpBubbleBlocks = () => {
  const nowMs = useNowMs();
  return (
    <>
      <Block
        title="Bulles d'aide"
        note="Huit conseils, chacun montré une seule fois par appareil, au moment où il sert, avec une flèche sur son élément. Une seule bulle à la fois, la plus prioritaire (dans l'ordre ci-dessous), conseil de première visite compris ; une bulle qui attend vient plus tard si sa condition tient encore. Jamais en vue OBS, ni pendant qu'une fenêtre est ouverte, sauf les deux de la chaîne OBS, qui vivent dans la fenêtre ; jamais par-dessus la pill qu'elles désignent."
      >
        {HELP_SCENES.map((scene) => (
          <HelpSceneRow key={scene.name} scene={scene} nowMs={nowMs} />
        ))}
      </Block>
      <Block
        title="La chaîne OBS, dans la fenêtre"
        note="Après Réglages, le streamer est guidé jusqu'à l'adresse, une fois par appareil. La fenêtre ouverte sur une autre section que Vue OBS : une bulle à gauche de l'onglet, montrée une seule fois : elle s'efface quand il l'ouvre ou ferme la fenêtre, et ne revient pas (un streamer qui y va directement la saute). Dans Vue OBS : une bulle sur l'adresse, qui s'efface quand il la copie, ou quand il quitte l'onglet après l'avoir vue. Copier l'adresse finit toute la chaîne. Ces bulles passent par-dessus la fenêtre, suivent son ouverture et son défilement, et se taisent si une petite fenêtre s'ouvre par-dessus."
      >
        <StateRow
          name="À gauche de l'onglet Vue OBS"
          detail="PC : la barre latérale est au bord de la fenêtre, la bulle se pose sur le voile, flèche vers l'onglet. Sans place à gauche (un écran étroit, le paysage), elle passe à sa droite, par-dessus le contenu."
        >
          <TabScene side="left" />
        </StateRow>
        <StateRow
          name="Sous l'onglet Vue OBS"
          detail="Mobile : les onglets sont une rangée qui défile en largeur ; l'onglet visé revient à la vue, et la bulle se pose dessous, par-dessus le contenu."
        >
          <TabScene side="below" />
        </StateRow>
        <StateRow
          name="Sur l'adresse à copier"
          detail="Flèche sur le champ qui se copie, que le bouton Copier valide."
        >
          <AddressScene />
        </StateRow>
      </Block>
      <Block title="Côtés de la cible">
        <StateRow
          name="Dessous"
          detail="Une pill tout en haut n'a pas de place au-dessus : la flèche pointe vers le haut."
        >
          <Below />
        </StateRow>
        <StateRow
          name="À gauche d'une colonne"
          detail="Une barre en colonne à droite de l'écran (paysage, pliables) : ni dessus ni dessous, la bulle se pose à sa gauche."
        >
          <Beside side="left" />
        </StateRow>
        <StateRow name="À droite d'une colonne" detail="Une colonne à gauche : la bulle se pose à sa droite.">
          <Beside side="right" />
        </StateRow>
      </Block>
    </>
  );
};

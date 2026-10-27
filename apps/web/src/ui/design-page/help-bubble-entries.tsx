// Les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) dans l'entrée Bulle : chacune sur la vraie pill qu'elle désigne, avec
// sa flèche, puis les côtés d'où une bulle vise sa cible. Les mêmes textes et les mêmes cibles que dans le jeu. Les deux de la
// chaîne OBS vivent dans la fenêtre (JOURNAL 2026-10-09) : leur bloc montre l'onglet et l'adresse tels que la fenêtre les pose.

import { PALETTE } from "@liveplace/domain";
import { Eraser, MonitorPlay, Pipette, Scaling, Shield, Trash, User } from "lucide-react";
import { type ReactNode, type RefObject, useRef } from "react";
import type { Refill } from "../../state/gauge";
import type { HelpBubble } from "../../state/help-bubbles";
import { AccountPill } from "../account/account-pill";
import { wrapBubbleTab } from "../account/account-window";
import { ThemeSettings } from "../canvas/canvas-settings";
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
import { InspectionPill } from "../inspection/inspection-pill";
import { ObsAddress } from "../obs/obs-settings";
import { noop, SAMPLE_PLACEMENT_ID } from "./design-fixtures";
import { Block, InPhone, StateRow, useNowMs } from "./entry-layout";
import { DRAFT_ACTIONS, draftState, gaugeAt, SIGNED_IN } from "./game-entries";

const REFILL: Refill = { refillMs: 10_000, refillCharges: 1 };
const GAUGE_MAX = 10; // celle de `gaugeAt`

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
  const target = helpTargetOf(bubble);
  const line = (
    <Bubble isVisible isDocked={false} side={side} target={target && targets[target]}>
      <HelpBubbleLine bubble={bubble} isTouchScreen={isTouchScreen} refill={refill} gaugeMax={GAUGE_MAX} />
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

// Le dessin d'un autre compte, inspecté par qui modère : sa pill porte « Effacer ses dessins » et Bannir.
const InspectedPose = ({ nowMs }: { nowMs: number }) => (
  <InspectionPill
    inspection={{
      status: "found",
      x: 122,
      y: 82,
      entry: {
        userId: "3",
        login: "troll42",
        displayName: "Troll42",
        colorIndex: 5,
        placedAt: nowMs - 60_000,
        placementId: SAMPLE_PLACEMENT_ID,
      },
    }}
    palette={PALETTE}
    nowMs={nowMs}
    onClose={noop}
    moderation={{ isProtected: () => false, onModerate: noop }}
    isDocked={false}
  />
);

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
    name: "Qui modère sans être le streamer",
    detail:
      "En Vue, une fois par appareil : flèche sur Modération. Elle s'efface quand la fenêtre s'ouvre sur Modération ; un signalement en attente passe avant elle, et ouvrir Modération les fait trouver tous les deux.",
    bubble: "moderator-welcome",
    side: "below",
    align: "end",
    content: () => <Account hasModeration />,
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
    detail:
      "Flèche sur le +1. Le chiffre dit où la récompense emmène la jauge. Elle s'efface quand on le touche, ou à l'action suivante.",
    bubble: "first-reward",
    content: viewBar(7, true),
  },
  {
    name: "Inspecter le dessin d'un autre compte, pour qui modère",
    detail:
      "La seule bulle montrée pendant une inspection, la première fois : flèche sur « Effacer ses dessins », où Bannir attend à côté. Elle s'efface à la fermeture de l'inspection ou à l'action suivante. Jamais sur les dessins du streamer ni sur les siens, qui n'ont pas d'actions.",
    bubble: "moderation-actions",
    align: "end",
    content: (nowMs) => <InspectedPose nowMs={nowMs} />,
  },
  {
    name: "Jauge vide, la première fois",
    detail:
      "Les chiffres viennent de la fresque : sa recharge, au singulier. Elle reste deux secondes après l'action qui la ferme (l'action suivante, ou un pixel qui revient) : la recharge se lit pendant qu'elle arrive.",
    bubble: "empty-gauge",
    align: "start",
    content: viewBar(0, false),
  },
  {
    name: "Jauge vide, plusieurs pixels par recharge",
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
    name: "La souris déplace la vue au lieu de dessiner",
    detail:
      "Après le premier glissement en Dessin à la souris : une ligne, sans flèche (Espace n'a pas de bouton), au-dessus de la barre du bas comme Ctrl+Z. Elle part à l'action suivante, Espace tenu compris, et passe devant le premier passage et Ctrl+Z, qui attendent.",
    bubble: "draft-space",
    isTouchScreen: false,
    content: (nowMs) =>
      bar(draftState(nowMs, { draftSize: 0, canSubmit: false, canDiscard: false, canUndo: false }), false),
  },
  {
    name: "Premier passage en Dessin, au doigt",
    detail:
      "Flèche sur Valider : rien n'est posé avant. Elle reste deux secondes après le premier pixel du brouillon, le temps de lire sa fin, puis s'efface ; en sortant du Dessin, elle s'efface aussitôt. En paysage et sur un pliable déplié, elle se pose à gauche du panneau et la bande Thème s'efface le temps de la bulle.",
    bubble: "first-draft",
    align: "end",
    isPhone: true,
    content: (nowMs) =>
      bar(
        draftState(nowMs, { isTouchScreen: true, canSubmit: false, canDiscard: false, canUndo: false }),
        true,
      ),
  },
  {
    name: "Premier passage en Dessin, à la souris",
    detail: "« Clique » au lieu de « Touche ».",
    bubble: "first-draft",
    align: "end",
    isTouchScreen: false,
    content: (nowMs) =>
      bar(draftState(nowMs, { canSubmit: false, canDiscard: false, canUndo: false }), false),
  },
  {
    name: "Un dessin posé, au doigt : la palette",
    detail:
      "Écran tactile, une fois un premier dessin posé sur l'appareil, en Dessin : flèche sur la couleur actuelle, qui ouvre la palette complète. Elle s'efface quand la palette s'ouvre, ou en sortant du Dessin.",
    bubble: "palette",
    align: "start",
    isPhone: true,
    content: (nowMs) => bar(draftState(nowMs, { isTouchScreen: true }), true),
  },
  {
    name: "Un pixel au brouillon, à la souris : Ctrl+Z",
    detail:
      "Une fois un premier dessin posé sur l'appareil. Une ligne, sans flèche : au-dessus de la barre du bas, comme le conseil de première visite. Elle paraît dès le premier pixel du brouillon, jamais devant un brouillon vide. Elle reste deux secondes après l'action suivante, ou en Dessin tant qu'on n'en sort pas.",
    bubble: "keys",
    isTouchScreen: false,
    content: (nowMs) => bar(draftState(nowMs, { draftSize: 1 }), false),
  },
  {
    name: "Trois dessins posés, à la souris : la pipette",
    detail:
      "Flèche sur la pipette. Elle s'efface quand on la touche, à l'action suivante, ou en sortant du Dessin, et reste deux secondes.",
    bubble: "eyedropper",
    align: "center",
    isTouchScreen: false,
    content: (nowMs) => bar(draftState(nowMs), false),
  },
  {
    name: "Trois dessins posés, au doigt : la pipette",
    detail: "La même, sur la feuille Dessin : flèche sur la pipette de la rangée d'outils.",
    bubble: "eyedropper",
    align: "center",
    isPhone: true,
    content: (nowMs) => bar(draftState(nowMs, { isTouchScreen: true }), true),
  },
];

// Quatre sections de la barre latérale : celle que la bulle désigne, Vue OBS ou Modération, est au milieu, où la bulle se centre sur elle.
const TAB_SECTIONS = {
  "obs-tab": [
    { id: "canvas", label: "Fresque", icon: Scaling },
    { id: "obs", label: "Vue OBS", icon: MonitorPlay },
    { id: "account", label: "Mon compte", icon: User },
  ],
  "twitch-sync": [
    { id: "canvas", label: "Fresque", icon: Scaling },
    { id: "moderation", label: "Modération", icon: Shield },
    { id: "account", label: "Mon compte", icon: User },
  ],
} as const;

// L'onglet visé, dans la barre latérale (PC : la bulle à sa gauche, sur le voile) ou la rangée d'onglets de la feuille (la bulle
// dessous, par-dessus le contenu) : Vue OBS ou Modération. Le vrai composant des onglets, et la vraie cible.
const TabScene = ({ side, bubble }: { side: "left" | "below"; bubble: keyof typeof TAB_SECTIONS }) => {
  const targets = useBubbleTargets();
  const target = helpTargetOf(bubble);
  const nav = (
    <div className={classNames("lp-pill", side === "left" ? "design-nav-column" : "design-nav-row")}>
      <WindowNav sections={TAB_SECTIONS[bubble]} currentId="canvas" onSelect={noop} wrapTab={wrapBubbleTab} />
    </div>
  );
  const line = (
    <Bubble isVisible isDocked={false} side={side} target={target && targets[target]}>
      <HelpBubbleLine bubble={bubble} isTouchScreen={false} refill={REFILL} gaugeMax={GAUGE_MAX} />
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

// Le lien de Vue OBS, à coller dans OBS et à partager : le même champ porte la bulle de l'adresse, puis celle du partage.
const AddressScene = ({ bubble }: { bubble: "obs-address" | "invite-link" }) => (
  <Aimed bubble={bubble}>
    <div className="lp-pill design-in-window">
      <div className="lp-setting">
        <ObsAddress address="liveplace.tv/kalyss" url="https://liveplace.tv/kalyss" />
      </div>
    </div>
  </Aimed>
);

// Le thème de la fresque, dans la section Fresque : la bulle au-dessus du champ, sans son libellé.
const ThemeScene = () => (
  <Aimed bubble="theme">
    <div className="lp-pill design-in-window">
      <ThemeSettings theme={{ status: "ready", value: "", isSaving: false, onInput: noop, onCommit: noop }} />
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

// Des boutons dans une pill, l'un d'eux visé (le premier par défaut) : en rangée ou en colonne.
const Tools = ({
  target,
  layout,
  aimed = 0,
}: {
  target: RefObject<HTMLSpanElement | null>;
  layout?: "rail";
  aimed?: number;
}) => (
  <Pill layout={layout}>
    {TOOLS.map(({ icon, title }, index) => (
      <span key={title} className="lp-bubble-target" ref={index === aimed ? target : undefined}>
        <Button icon={icon} variant="ghost" title={title} onPress={noop} />
      </span>
    ))}
  </Pill>
);

// Une colonne de boutons, avec une bulle à sa gauche ou à sa droite : la barre du bas en paysage (colonne à droite). Comme dans le
// jeu, la bulle est centrée sur sa cible : le bouton du milieu, au centre de la colonne.
const Beside = ({ side }: { side: "left" | "right" }) => {
  const target = useRef<HTMLSpanElement>(null);
  const line = (
    <Bubble isVisible isDocked={false} side={side} target={target}>
      <BubbleLine icon={Eraser}>La bulle se pose du côté où elle tient</BubbleLine>
    </Bubble>
  );
  const column = <Tools target={target} layout="rail" aimed={1} />;
  return (
    <div className="design-bubble-row design-bubble-row--middle">
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
        note="Dix-sept conseils, chacun montré une seule fois par appareil, au moment où il sert, avec une flèche sur son élément (Ctrl+Z et Espace, sans). Une seule bulle à la fois, la plus prioritaire (dans l'ordre ci-dessous), conseil de première visite compris ; une bulle qui attend vient plus tard si sa condition tient encore. Les trois derniers viennent avec les dessins posés sur l'appareil : la palette dès le premier, Ctrl+Z dès le premier aussi, une fois un pixel au brouillon, la pipette au troisième. Quatre restent deux secondes après l'action qui les ferme (la jauge vide, le premier passage en Dessin, Ctrl+Z, la pipette) tant que leur cible est à l'écran ; les treize autres partent aussitôt. Une inspection ouverte les fait taire toutes, sauf celle des actions de modération, qui vit dans l'inspection. Jamais en vue OBS, ni pendant qu'une fenêtre est ouverte, sauf celles de la chaîne du streamer, qui vivent dans la fenêtre ; jamais par-dessus la pill qu'elles désignent. La flèche s'arrête contre la pill, à la colonne ou à la rangée du bouton : l'anneau du focus entoure le bouton visé tant que la bulle est montrée. Sans côté qui tienne à la largeur du texte (un téléphone couché étroit, un pliable), la bulle se resserre à la place d'un côté et son texte passe à la ligne."
      >
        {HELP_SCENES.map((scene) => (
          <HelpSceneRow key={scene.name} scene={scene} nowMs={nowMs} />
        ))}
      </Block>
      <Block
        title="La chaîne du streamer, dans la fenêtre"
        note="Après Réglages, le streamer est guidé dans la fenêtre, une fois par appareil, dans cet ordre : l'onglet Vue OBS, l'adresse, le lien à partager, le thème, la synchronisation Twitch. La fenêtre ouverte sur une autre section que Vue OBS : une bulle à gauche de l'onglet, montrée une seule fois : elle s'efface quand il l'ouvre ou ferme la fenêtre, et ne revient pas (un streamer qui y va directement la saute). Dans Vue OBS : une bulle sur le lien, qui s'efface quand il le copie, ou quand il quitte l'onglet après l'avoir vue ; copier finit la chaîne OBS, et la même case porte alors la bulle du partage aux viewers, jusqu'à la copie suivante. Dans Fresque : le thème, tant que la fresque n'en a pas. Ailleurs que dans Modération : la synchronisation Twitch, tant qu'elle n'a jamais été faite. Chacune s'efface en quittant sa section ou en fermant la fenêtre, et ne revient pas. Ces bulles passent par-dessus la fenêtre, suivent son ouverture et son défilement, et se taisent si une petite fenêtre s'ouvre par-dessus."
      >
        <StateRow
          name="À gauche de l'onglet Vue OBS"
          detail="PC : la barre latérale est au bord de la fenêtre, la bulle se pose sur le voile, flèche vers l'onglet. Sans place à gauche (un écran étroit, le paysage), elle passe à sa droite, par-dessus le contenu."
        >
          <TabScene side="left" bubble="obs-tab" />
        </StateRow>
        <StateRow
          name="Sous l'onglet Vue OBS"
          detail="Mobile : les onglets sont une rangée qui défile en largeur ; l'onglet visé revient à la vue, et la bulle se pose dessous, par-dessus le contenu."
        >
          <TabScene side="below" bubble="obs-tab" />
        </StateRow>
        <StateRow
          name="Sur l'adresse à copier"
          detail="Flèche sur le champ qui se copie, que le bouton Copier valide."
        >
          <AddressScene bubble="obs-address" />
        </StateRow>
        <StateRow
          name="Sur le même bouton, pour le partager"
          detail="Dans Vue OBS, une fois l'adresse copiée : la bulle du partage prend la place de celle de l'adresse, sur le même bouton. Elle s'efface à la copie suivante, en quittant l'onglet ou à la fermeture de la fenêtre."
        >
          <AddressScene bubble="invite-link" />
        </StateRow>
        <StateRow
          name="Sur le champ du thème"
          detail="Dans Fresque, tant que la fresque n'a pas de thème : flèche sur le champ, sans son libellé. Elle s'efface quand un thème est enregistré, ou en quittant la section."
        >
          <ThemeScene />
        </StateRow>
        <StateRow
          name="À gauche de l'onglet Modération"
          detail="La fenêtre ouverte ailleurs que sur Modération, la synchronisation Twitch jamais faite : flèche sur l'onglet, à sa gauche sur PC. Elle s'efface quand il ouvre Modération."
        >
          <TabScene side="left" bubble="twitch-sync" />
        </StateRow>
        <StateRow
          name="Sous l'onglet Modération"
          detail="Mobile : la même, sous l'onglet, par-dessus le contenu."
        >
          <TabScene side="below" bubble="twitch-sync" />
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

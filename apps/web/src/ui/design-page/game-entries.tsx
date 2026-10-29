// Le chapitre L'écran de jeu : les pills, les vraies, avec des props d'exemple, chacune dans chacun de ses états.

import { PALETTE } from "@liveplace/domain";
import { type ReactNode, useState } from "react";
import { AccountPill, type AccountPillProps } from "../account/account-pill";
import { SignInExpired } from "../account/sign-in-expired";
import { ArchiveNotFound } from "../archive/archive-not-found";
import { CanvasPill, type CanvasPillFold } from "../canvas/canvas-pill";
import { CANVAS_TEXTS } from "../canvas/canvas-texts";
import type { Framing } from "../canvas/viewport";
import { ViewportPill } from "../canvas/viewport-pill";
import { Button } from "../design/button";
import type { GaugeProps } from "../design/gauge";
import { NoticePill } from "../design/pill";
import type { ProfileUser } from "../design/profile";
import { ThemePill } from "../design/theme-pill";
import { Toast } from "../design/toast";
import { SignInButton, SignInNote } from "../design/twitch";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { DraftPill, type DraftPillActions, type DraftPillState } from "../draft/draft-pill";
import { BubbleTargetsContext, useBubbleTargets } from "../help/bubble-target";
import { CursorBlock } from "./cursor-block";
import { noop, SAMPLE_LIVE_OWNER, SAMPLE_OWNER } from "./design-fixtures";
import {
  Block,
  Entry,
  InHinge,
  InLandscape,
  InNotice,
  InPhone,
  InPhoneTop,
  InTopRoom,
  StateRow,
  useNowMs,
} from "./entry-layout";
import { GrowthPreviewDemo } from "./growth-preview-demo";
import { PanFadeDemo } from "./pan-fade-demo";

const REFILL_MS = 10_000;

export const SIGNED_IN = { kind: "signedIn", user: SAMPLE_OWNER } as const;

type PhoneHeaderProps = {
  owner: ProfileUser;
  identity?: AccountPillProps["identity"];
  theme?: string | undefined;
  isNarrow?: boolean;
  isDrafting?: boolean;
  fold?: CanvasPillFold;
};

// Le haut d'un téléphone en Vue : la rangée des pills Canvas et Compte, la bande Thème dessous. En Dessin (Écart §8.1, JOURNAL
// 2026-10-08), les deux pills de la rangée sont effacées : seule la bande reste, montée tout en haut. Un invité n'a pas de pill
// Compte (Écart §8.1, JOURNAL 2026-10-08) : la pill Canvas prend la rangée.
const PhoneHeader = ({
  owner,
  identity = SIGNED_IN,
  theme,
  isNarrow = false,
  isDrafting = false,
  fold,
}: PhoneHeaderProps) => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <InPhoneTop isNarrow={isNarrow}>
      {!isDrafting && (
        <div className="design-phone-row">
          <div className="design-phone-row-start">
            <CanvasPill owner={owner} isCompact isDocked={false} {...(fold ? { fold } : {})} />
          </div>
          <AccountPill
            identity={identity}
            signInHref="#"
            appearanceChoice={appearanceChoice}
            onPickAppearance={pickAppearance}
            onOpenAccount={noop}
            isCompact
            isDocked={false}
          />
        </div>
      )}
      <ThemePill theme={theme} isDocked={false} />
    </InPhoneTop>
  );
};

// Écart §8.1 (JOURNAL 2026-10-08, 2026-10-09) : déplacer, zoomer, recentrer ou ouvrir une case replie la pill Canvas, la toucher la déplie.
const FoldDemo = () => {
  const [isFolded, setIsFolded] = useState(false);
  return (
    <>
      <PhoneHeader
        owner={SAMPLE_LIVE_OWNER}
        theme={SHORT_THEME}
        fold={{ isFolded, onUnfold: () => setIsFolded(false) }}
      />
      <Button label="Déplacer la fresque" onPress={() => setIsFolded(true)} />
    </>
  );
};

const FOLDED: CanvasPillFold = { isFolded: true, onUnfold: noop };

export const CanvasPillEntry = () => (
  <Entry
    slug="pill-canvas"
    components={["CanvasPill"]}
    file="ui/canvas/canvas-pill.tsx"
    note="Sur mobile, elle se replie sur la photo quand on déplace, zoome, recentre ou ouvre une case sur la fresque, et la toucher la déplie. Un simple appui ou un trait en Dessin ne la replie pas. Rien n'est retenu : chaque visite commence dépliée."
    where="En haut à gauche"
  >
    <Block title="États">
      <StateRow name="Fresque">
        <CanvasPill owner={SAMPLE_OWNER} isDocked={false} />
      </StateRow>
    </Block>
    <Block title="Sur mobile">
      <StateRow name="Version compacte">
        <CanvasPill owner={SAMPLE_OWNER} isCompact isDocked={false} />
      </StateRow>
      <StateRow
        name="En live, catégorie longue"
        detail="Elle ne dépasse jamais la place que la pill Compte lui laisse : la catégorie prend ce qui reste et se coupe par « … »."
      >
        <PhoneHeader owner={SAMPLE_LIVE_OWNER} />
      </StateRow>
      <StateRow
        name="En live, presque plus de place"
        detail="La catégorie disparaît, le logo et le rond restent ; le nom ne se coupe qu'en dernier."
      >
        <PhoneHeader owner={SAMPLE_LIVE_OWNER} isNarrow />
      </StateRow>
      <StateRow
        name="En live, invité"
        detail="Pas de pill Compte : la pill Fresque prend toute la rangée, la catégorie avec."
      >
        <PhoneHeader owner={SAMPLE_LIVE_OWNER} identity={{ kind: "guest" }} />
      </StateRow>
    </Block>
    <Block title="Repliée sur mobile">
      <StateRow
        name="Repliée"
        detail="La photo seule, en bouton : la pill Compte et la bande Thème ne bougent pas, la fresque non plus."
      >
        <PhoneHeader owner={SAMPLE_OWNER} theme={SHORT_THEME} fold={FOLDED} />
      </StateRow>
      <StateRow
        name="Repliée, en live"
        detail="Le rond violet de Twitch reste sur la photo ; le bouton le dit aussi à voix haute."
      >
        <PhoneHeader owner={SAMPLE_LIVE_OWNER} theme={SHORT_THEME} fold={FOLDED} />
      </StateRow>
      <StateRow
        name="Se replie sur la fresque, se déplie au toucher"
        detail="Déplacer, zoomer, recentrer ou ouvrir une case la replie ; toucher la photo la déplie."
        isDemo
      >
        <FoldDemo />
      </StateRow>
    </Block>
  </Entry>
);

const SHORT_THEME = "Halloween";
const LONG_THEME = "Grande pixel war de la rentrée des lives"; // 40 caractères, le maximum
const TWO_LINES_THEME = "Festival international des pixels fous";

// Le thème qui paraît, change de largeur puis part : la pill, comme dans le jeu quand le streamer règle son thème.
const THEME_STEPS = [undefined, SHORT_THEME, "Pixel war de la rentrée", undefined] as const;

const ThemeDemo = () => {
  const [step, setStep] = useState(0);
  return (
    <>
      <InTopRoom>
        <ThemePill theme={THEME_STEPS[step]} isDocked={false} />
      </InTopRoom>
      <Button label="Changer le thème" onPress={() => setStep((step + 1) % THEME_STEPS.length)} />
    </>
  );
};

export const ThemePillEntry = () => (
  <Entry
    slug="pill-theme"
    components={["ThemePill"]}
    file="ui/design/theme-pill.tsx"
    note="Le thème de la fresque, pour tout le monde, dès que le streamer l'a rempli : pas cliquable, et jamais dans la vue OBS ni sur une archive. Sans thème, pas de pill."
    where="En haut au centre, entre les pills Fresque et Compte · sur mobile, une bande sous la rangée des pills du haut, qui monte à leur place en Dessin"
  >
    <Block title="États">
      <StateRow name="Un thème court" detail="Un petit texte discret au-dessus, le thème dessous, gros.">
        <ThemePill theme={SHORT_THEME} isDocked={false} />
      </StateRow>
      <StateRow
        name="Un thème de 40 caractères, le maximum"
        detail="Entre les deux pills, la place manque : il se coupe par « … » plutôt que de passer dessous."
      >
        <InTopRoom>
          <ThemePill theme={LONG_THEME} isDocked={false} />
        </InTopRoom>
      </StateRow>
      <StateRow
        name="Elle paraît, change de largeur et part"
        detail="Quand le streamer règle son thème, partout en direct."
        isDemo
      >
        <ThemeDemo />
      </StateRow>
    </Block>
    <Block title="Sur mobile">
      <StateRow
        name="Un thème court"
        detail="Une bande sous la rangée des pills du haut, sur la même largeur : « Thème » en petit devant le thème, sur la même ligne."
      >
        <PhoneHeader owner={SAMPLE_OWNER} theme={SHORT_THEME} />
      </StateRow>
      <StateRow name="Un thème sur deux lignes" detail="Deux lignes au plus, coupé par « … » au-delà.">
        <PhoneHeader owner={SAMPLE_OWNER} theme={LONG_THEME} />
      </StateRow>
      <StateRow
        name="En Dessin"
        detail="Les pills Fresque et Compte s'effacent en fondu, la bande monte à leur place : seul le thème reste en haut. Sans thème, le haut est vide."
      >
        <PhoneHeader owner={SAMPLE_OWNER} theme={SHORT_THEME} isDrafting />
      </StateRow>
      <StateRow
        name="Pendant un déplacement de la fresque"
        detail="Les pills Fresque et Compte et la bande s'effacent en fondu tant que la vue bouge, et reviennent dès que le doigt se lève, par le même fondu, avec la bulle d'aide qui vise l'une d'elles. La barre du bas reste."
        isDemo
      >
        <PanFadeDemo>
          <PhoneHeader owner={SAMPLE_OWNER} theme={SHORT_THEME} />
        </PanFadeDemo>
      </StateRow>
      <StateRow
        name="Un toast sous la bande"
        detail="Il se pose dessous et ne la recouvre jamais, quelle que soit sa hauteur ; en Dessin, sous la bande montée."
      >
        <InPhoneTop>
          <ThemePill theme={TWO_LINES_THEME} isDocked={false} />
          <Toast message={{ id: 1, tone: "success", text: "Thème enregistré" }} isDocked={false} />
        </InPhoneTop>
      </StateRow>
    </Block>
  </Entry>
);

type AccountScene = {
  name: string;
  detail?: string;
  identity: AccountPillProps["identity"];
  isCompact?: boolean;
  pendingReports?: number;
  hasSettings?: boolean;
  hasModeration?: boolean;
  isDeveloper?: boolean; // écart §10.3 (JOURNAL 2026-10-06) : le bouton Développeur
  isInRow?: boolean; // la rangée d'un téléphone, pour dire la place qu'une pill absente laisse à la pill Canvas
  hasBottomBar?: boolean; // faux : la page d'une archive, sans barre du bas
};

const ACCOUNT_BLOCKS: readonly { title: string; scenes: readonly AccountScene[] }[] = [
  {
    title: "Avant connexion et invité",
    scenes: [
      { name: "Avant la réponse du gateway", identity: { kind: "unknown" } },
      { name: "Invité", identity: { kind: "guest" } },
    ],
  },
  {
    title: "Connecté",
    scenes: [{ name: "Connecté", detail: "Sa photo ouvre Mon compte.", identity: SIGNED_IN }],
  },
  {
    title: "Qui modère sur la fresque d'un autre",
    scenes: [
      {
        name: "Qui modère",
        detail: "Modération ouvre la fenêtre sur Modération.",
        identity: SIGNED_IN,
        hasModeration: true,
      },
      {
        name: "Qui modère, des signalements attendent",
        detail: "Le point sur Modération, pas sur sa photo.",
        identity: SIGNED_IN,
        pendingReports: 2,
        hasModeration: true,
      },
    ],
  },
  {
    title: "Le streamer sur sa fresque",
    scenes: [
      {
        name: "Sa seule pill",
        detail: "Réglages ouvre la fenêtre sur Fresque.",
        identity: SIGNED_IN,
        hasSettings: true,
      },
      {
        name: "Un signalement attend",
        detail: "Le point sur sa photo.",
        identity: SIGNED_IN,
        pendingReports: 2,
        hasSettings: true,
      },
      {
        name: "Le développeur",
        detail: "Développeur ouvre sa fenêtre, sur Activité.",
        identity: SIGNED_IN,
        hasSettings: true,
        isDeveloper: true,
      },
    ],
  },
  {
    title: "Sur mobile",
    scenes: [
      {
        name: "Invité",
        detail:
          "Aucune pill : la barre du bas dit déjà « Se connecter pour dessiner », et l'apparence est dans Mon compte.",
        identity: { kind: "guest" },
        isCompact: true,
        isInRow: true,
      },
      {
        name: "Invité, sur la page d'une archive",
        detail: "Sans barre du bas, Se connecter reste dans la pill, avec son libellé.",
        identity: { kind: "guest" },
        isCompact: true,
        hasBottomBar: false,
      },
      { name: "Connecté", detail: "Sa photo seule.", identity: SIGNED_IN, isCompact: true },
      { name: "Le streamer sur sa fresque", identity: SIGNED_IN, isCompact: true, hasSettings: true },
      {
        name: "Qui modère, des signalements attendent",
        identity: SIGNED_IN,
        isCompact: true,
        pendingReports: 2,
        hasModeration: true,
      },
      {
        name: "Le développeur",
        identity: SIGNED_IN,
        isCompact: true,
        hasSettings: true,
        isDeveloper: true,
      },
    ],
  },
];

const AccountSceneView = ({ scene }: { scene: AccountScene }) => {
  const appearanceChoice = useAppearanceChoice();
  const {
    identity,
    isCompact,
    pendingReports,
    hasSettings,
    hasModeration,
    isDeveloper,
    isInRow,
    hasBottomBar,
  } = scene;
  if (isInRow) return <PhoneHeader owner={SAMPLE_OWNER} identity={identity} />;
  return (
    <AccountPill
      identity={identity}
      signInHref="#"
      appearanceChoice={appearanceChoice}
      onPickAppearance={pickAppearance}
      onOpenAccount={noop}
      onOpenSettings={hasSettings ? noop : undefined}
      onOpenModeration={hasModeration ? noop : undefined}
      onOpenDeveloper={isDeveloper ? noop : undefined}
      pendingReports={pendingReports ?? 0}
      isCompact={isCompact ?? false}
      hasBottomBar={hasBottomBar ?? true}
      isDocked={false}
    />
  );
};

export const AccountPillEntry = () => (
  <Entry
    slug="pill-compte"
    components={["AccountPill"]}
    file="ui/account/account-pill.tsx"
    note="Le streamer sur sa fresque n'a que la pill Compte. Avec Développeur, Réglages ou Modération, l'apparence passe à droite de la photo. Sur mobile, elle n'a ni l'apparence ni Se connecter."
    where="En haut à droite"
  >
    {ACCOUNT_BLOCKS.map(({ title, scenes }) => (
      <Block key={title} title={title}>
        {scenes.map((scene) => (
          <StateRow key={scene.name} name={scene.name} detail={scene.detail}>
            <AccountSceneView scene={scene} />
          </StateRow>
        ))}
      </Block>
    ))}
  </Entry>
);

export const DRAFT_ACTIONS: DraftPillActions = {
  onEnter: noop,
  onClaim: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onUndo: noop,
  onRedo: noop,
  onPickColor: noop,
  onToggleEraser: noop,
  onTogglePicker: noop,
  onToggleTouchTracing: noop,
  onReload: noop,
  onSignIn: noop,
};

export const gaugeAt = (nowMs: number, charges: number, draft = 0): GaugeProps => ({
  charges,
  max: 10,
  draft,
  refill:
    charges < 10
      ? { endsAt: nowMs + REFILL_MS / 2, durationMs: REFILL_MS, secondsLeft: REFILL_MS / 2 / 1000 }
      : null,
  label: `${charges} / 10 pixels`,
});

export const draftState = (
  nowMs: number,
  overrides: Partial<Extract<DraftPillState, { kind: "draft" }>> = {},
) =>
  ({
    kind: "draft",
    gauge: gaugeAt(nowMs, 8, 3),
    palette: PALETTE,
    colorIndex: 5,
    recentColorIndexes: [1, 28, 19, 9, 42],
    isSending: false,
    draftSize: 3,
    canSubmit: true,
    canDiscard: true,
    canUndo: true,
    canRedo: false,
    isTouchScreen: false,
    isTouchTracing: false,
    isPicking: false,
    ...overrides,
  }) satisfies DraftPillState;

type DraftScene = { name: string; detail?: string; isNarrow?: boolean; state: DraftPillState };

// Les 26 états de la pill Dessin, par bloc : la connexion, l'invité et le banni, la vue, le dessin, puis le mobile.
type DraftBlock = { title: string; isCompact?: boolean; scenes: readonly DraftScene[] };

const draftBlocks = (nowMs: number): readonly DraftBlock[] => [
  {
    title: "Connexion",
    scenes: [
      { name: "En cours", detail: "Floue, Valider bloqué.", state: { kind: "connecting" } },
      { name: "Perdue", detail: "Pour de bon : seul Recharger reste.", state: { kind: "closed" } },
      {
        name: "Reconnexion en Dessin",
        detail: "Son contenu flouté, rien n'y répond.",
        state: { kind: "reconnecting", shown: draftState(nowMs) },
      },
    ],
  },
  {
    title: "Invité et banni",
    scenes: [
      { name: "Banni", detail: "Lecture seule.", state: { kind: "banned" } },
      { name: "Invité", detail: "L'invitation, directement.", state: { kind: "guest", signInHref: "#" } },
      {
        name: "Invité, parti chez Twitch",
        detail: "Connexion à Twitch.",
        state: { kind: "signingIn", signInHref: "#" },
      },
    ],
  },
  {
    title: "Vue",
    scenes: [
      {
        name: "Jauge pleine",
        state: { kind: "view", gauge: gaugeAt(nowMs, 10), canClaim: false },
      },
      {
        name: "Jauge vide",
        detail: "Dessiner reste là : le mode Dessin reste accessible.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 0), canClaim: false },
      },
      {
        name: "Une récompense attend",
        detail: "Le +1 prend la place de Dessiner.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 7), canClaim: true },
      },
      {
        name: "Un brouillon gardé",
        detail:
          "Dessiner dit la taille du brouillon, comme Valider, et la partie claire du fluide le réserve, comme en Dessin.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 8, 3), canClaim: false, draftSize: 3 },
      },
      {
        name: "Après un refus",
        detail: "La raison, à côté de Dessiner.",
        state: {
          kind: "view",
          gauge: gaugeAt(nowMs, 2),
          canClaim: false,
          refusal: "rate_limited",
        },
      },
    ],
  },
  {
    title: "Dessin",
    scenes: [
      {
        name: "Un brouillon de 3",
        detail:
          "Le nombre de la jauge dit ce que tu as, sa partie claire ce que le brouillon réserve, Valider sa taille. Annuler est actif, Rétablir grisé : rien n'a été annulé.",
        state: draftState(nowMs),
      },
      {
        name: "Brouillon vide",
        detail:
          "Vider est là, invisible : il paraît au premier pixel, et rien ne bouge. Annuler et Rétablir restent là, grisés.",
        state: draftState(nowMs, {
          gauge: gaugeAt(nowMs, 8),
          draftSize: 0,
          canSubmit: false,
          canDiscard: false,
          canUndo: false,
        }),
      },
      {
        name: "Plus aucun pixel",
        detail: "Valider attend le prochain, en direct.",
        state: draftState(nowMs, {
          gauge: gaugeAt(nowMs, 0),
          draftSize: 0,
          waitSeconds: REFILL_MS / 2 / 1000,
          canSubmit: false,
          canDiscard: false,
          canUndo: false,
        }),
      },
      {
        name: "Pendant l'envoi",
        detail: "Verrouillée, l'historique vidé : Annuler et Rétablir grisés.",
        state: draftState(nowMs, { isSending: true, canUndo: false }),
      },
      { name: "Pipette armée (I)", state: draftState(nowMs, { isPicking: true }) },
      {
        name: "Écran tactile",
        detail: "Tracé armé, gardé d'un Dessin au suivant jusqu'au rechargement.",
        state: draftState(nowMs, { isTouchScreen: true, isTouchTracing: true }),
      },
    ],
  },
  {
    title: "Sur mobile",
    isCompact: true,
    scenes: [
      {
        name: "Vue",
        detail: "La barre du bas, toute la largeur d'un téléphone.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: false },
      },
      {
        name: "Vue, une récompense attend",
        detail: "Le +1 à la place de Dessiner.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: true },
      },
      {
        name: "Vue, un brouillon gardé",
        detail: "« Dessiner · 3 », et la partie claire du fluide.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 6, 3), canClaim: false, draftSize: 3 },
      },
      {
        name: "Dessin",
        detail: "La feuille, palette repliée : Annuler actif, Rétablir grisé.",
        state: draftState(nowMs),
      },
      {
        name: "Dessin, brouillon vide",
        detail: "Vider est là, invisible : les outils gardent leur place quand il paraît.",
        state: draftState(nowMs, {
          gauge: gaugeAt(nowMs, 8),
          draftSize: 0,
          canSubmit: false,
          canDiscard: false,
          canUndo: false,
        }),
      },
      {
        name: "Dessin, plus aucun pixel",
        detail: "Valider attend le prochain.",
        state: draftState(nowMs, {
          gauge: gaugeAt(nowMs, 0),
          draftSize: 0,
          waitSeconds: REFILL_MS / 2 / 1000,
          canSubmit: false,
          canDiscard: false,
          canUndo: false,
        }),
      },
      {
        name: "Dessin, plus aucun pixel, 320 px",
        detail: "Sous 360 px, « Attendre » s'efface : « 5 s » seul.",
        isNarrow: true,
        state: draftState(nowMs, {
          gauge: gaugeAt(nowMs, 0),
          draftSize: 0,
          waitSeconds: REFILL_MS / 2 / 1000,
          canSubmit: false,
          canDiscard: false,
          canUndo: false,
        }),
      },
      {
        name: "Dessin, un gros brouillon, 320 px",
        detail:
          "Valider garde la largeur de « Valider · 99 » : la jauge, Fermer et Valider tiennent sur 320 px.",
        isNarrow: true,
        state: draftState(nowMs, { draftSize: 99 }),
      },
      { name: "Invité", detail: "L'invitation au centre.", state: { kind: "guest", signInHref: "#" } },
    ],
  },
];

// Comme dans le jeu, où le +1 est enveloppé dans la cible d'une bulle : son `<span>` ne doit pas le rétrécir (Écart §9.3, JOURNAL 2026-10-09).
const WithBubbleTargets = ({ children }: { children: ReactNode }) => {
  const targets = useBubbleTargets();
  return <BubbleTargetsContext value={targets}>{children}</BubbleTargetsContext>;
};

// Un téléphone en paysage, puis les écrans à charnière (Écart §8.1 et §9.3, JOURNAL 2026-10-08).
const LandscapeBlocks = ({ nowMs }: { nowMs: number }) => (
  <>
    <Block
      title="En colonne sur le côté"
      note="Sur un écran bas (un téléphone en paysage) ou un écran tactile large dont les deux côtés font au moins 560 px (un pliable déplié, une tablette) : la barre du bas passe en colonne contre le bord droit. En Vue, la fresque prend la plus grande zone qu'elle lui laisse, à côté d'elle ou au-dessus ; en Dessin, le panneau garde la droite."
    >
      <StateRow name="Vue" detail="La jauge et Dessiner, l'un sous l'autre.">
        <InLandscape>
          <DraftPill
            state={{ kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: false }}
            actions={DRAFT_ACTIONS}
            isCompact
            isSidePanel
            isDocked={false}
          />
        </InLandscape>
      </StateRow>
      <StateRow
        name="Vue, une récompense attend"
        detail="Le +1 prend la place de Dessiner : aussi large que la colonne, comme lui."
      >
        <InLandscape>
          <WithBubbleTargets>
            <DraftPill
              state={{ kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: true }}
              actions={DRAFT_ACTIONS}
              isCompact
              isSidePanel
              isDocked={false}
            />
          </WithBubbleTargets>
        </InLandscape>
      </StateRow>
      <StateRow
        name="Vue, un brouillon gardé"
        detail="« Dessiner · 3 » s'étire sur la colonne, le fluide garde sa partie claire."
      >
        <InLandscape>
          <DraftPill
            state={{ kind: "view", gauge: gaugeAt(nowMs, 6, 3), canClaim: false, draftSize: 3 }}
            actions={DRAFT_ACTIONS}
            isCompact
            isSidePanel
            isDocked={false}
          />
        </InLandscape>
      </StateRow>
      <StateRow name="Invité" detail="L'invitation, dans la colonne.">
        <InLandscape>
          <DraftPill
            state={{ kind: "guest", signInHref: "#" }}
            actions={DRAFT_ACTIONS}
            isCompact
            isSidePanel
            isDocked={false}
          />
        </InLandscape>
      </StateRow>
      <StateRow
        name="Dessin"
        detail="Un panneau sur toute la hauteur : la palette complète défile sous les outils."
      >
        <InLandscape isPanel>
          <DraftPill
            state={draftState(nowMs)}
            actions={DRAFT_ACTIONS}
            isCompact
            isSidePanel
            isDocked={false}
          />
        </InLandscape>
      </StateRow>
      <StateRow
        name="Dessin, brouillon vide"
        detail="Vider garde sa place, invisible : Fermer et Valider ne bougent pas au premier pixel."
      >
        <InLandscape isPanel>
          <DraftPill
            state={draftState(nowMs, {
              gauge: gaugeAt(nowMs, 8),
              draftSize: 0,
              canSubmit: false,
              canDiscard: false,
              canUndo: false,
            })}
            actions={DRAFT_ACTIONS}
            isCompact
            isSidePanel
            isDocked={false}
          />
        </InLandscape>
      </StateRow>
    </Block>
    <Block
      title="Écrans à charnière"
      note="Jamais une pill ni un bouton sur la charnière : la fresque dans le premier écran, les commandes dans le second. Sur deux grands écrans, la colonne est celle du second ; en Flex mode, la barre du bas."
    >
      <StateRow name="Côte à côte" detail="Surface Duo déployé : la colonne dans le second écran.">
        <InHinge
          canvas={<CanvasPill owner={SAMPLE_OWNER} isCompact isDocked={false} />}
          controls={
            <InLandscape>
              <DraftPill
                state={{ kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: false }}
                actions={DRAFT_ACTIONS}
                isCompact
                isSidePanel
                isDocked={false}
              />
            </InLandscape>
          }
        />
      </StateRow>
      <StateRow
        name="L'un sur l'autre"
        detail="Galaxy Z Flip en Flex mode : la fresque en haut, la barre du bas en bas."
      >
        <InHinge
          isStacked
          canvas={<CanvasPill owner={SAMPLE_OWNER} isCompact isDocked={false} />}
          controls={
            <DraftPill
              state={{ kind: "view", gauge: gaugeAt(nowMs, 6), canClaim: false }}
              actions={DRAFT_ACTIONS}
              isCompact
              isDocked={false}
            />
          }
        />
      </StateRow>
    </Block>
  </>
);

export const DraftPillEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="dessin"
      components={["DraftPill", "GrowthPreview"]}
      file="ui/draft/draft-pill.tsx · ui/canvas/growth-preview-layers.tsx"
      note="La pill du joueur : regarder, réclamer, dessiner, envoyer. La même que dans le jeu, avec des props d'exemple. Sous elle, l'aperçu de la croissance d'une fresque à taille dynamique."
      where="En bas au centre · sur mobile, la barre du bas · en paysage ou sur un écran large (pliable déplié, tablette), une colonne en bas à droite"
    >
      {draftBlocks(nowMs).map(({ title, isCompact = false, scenes }) => (
        <Block key={title} title={title}>
          {scenes.map(({ name, detail, isNarrow = false, state }) => (
            <StateRow key={name} name={name} detail={detail}>
              {isCompact ? (
                // Sur mobile, la barre du bas prend toute la largeur : ici, celle d'un téléphone.
                <InPhone isNarrow={isNarrow}>
                  <DraftPill state={state} actions={DRAFT_ACTIONS} isCompact isDocked={false} />
                </InPhone>
              ) : (
                <DraftPill state={state} actions={DRAFT_ACTIONS} isCompact={false} isDocked={false} />
              )}
            </StateRow>
          ))}
        </Block>
      ))}
      <LandscapeBlocks nowMs={nowMs} />
      <Block
        title="L'aperçu de la croissance"
        note="En Dessin, dans une fresque à taille dynamique : les cases qui vont apparaître, avant la pose. Le damier à 35 %, et un contour en pointillé autour de la fresque telle qu'elle sera. La bordure d'aujourd'hui reste. Il apparaît et s'efface en fondu sur --lp-dur-fade (d'un coup en mouvement réduit), et ne prend aucun clic. Jamais en Vue, jamais dans la vue OBS."
      >
        <StateRow
          name="La souris vise la marge de gauche"
          detail="3 colonnes à gauche. Passe la souris sur la fresque : une case de la marge montre ce qui s'ajoute, une case du milieu ne montre rien."
          isDemo
        >
          <GrowthPreviewDemo initialAim={{ x: 0, y: 5 }} />
        </StateRow>
        <StateRow
          name="Un brouillon dans la marge de droite"
          detail="Au toucher, rien ne survole : c'est le brouillon qui montre l'aperçu, avant Valider. Ici, 3 colonnes à droite."
        >
          <GrowthPreviewDemo draft={DRAFT_IN_MARGIN} isInteractive={false} />
        </StateRow>
        <StateRow name="Au repos" detail="Rien : ni case visée, ni brouillon dans la marge.">
          <GrowthPreviewDemo isInteractive={false} />
        </StateRow>
      </Block>
    </Entry>
  );
};

// Une case de brouillon dans la marge de droite d'une 10 × 10 (l'aperçu de la croissance)
const DRAFT_IN_MARGIN = [{ x: 9, y: 4 }] as const;

// Sur ordinateur, la pill est toujours là et ne dit aucun pourcentage (Écart §8.1, JOURNAL 2026-10-13).
const VIEWPORT_STATES: readonly { name: string; detail: string; framing: Framing }[] = [
  {
    name: "Zoomer, dézoomer, recentrer",
    detail: "Les mêmes à l'arrivée et zoomé de près.",
    framing: { zoomPercent: 100, isArrival: true },
  },
];

const RecenterPill = () => (
  <ViewportPill
    framing={{ zoomPercent: 180, isArrival: false }}
    onZoomIn={noop}
    onZoomOut={noop}
    onRecenter={noop}
    isCompact
    isDocked={false}
  />
);

// Recentrer et la colonne : le canvas arrive dans la plus grande zone qu'elle lui laisse (Écart §9.3, JOURNAL 2026-10-09).
const WithColumn = ({ nowMs, isAbove }: { nowMs: number; isAbove: boolean }) => (
  <div
    className={
      isAbove ? "design-bubble-stack design-bubble-stack--end" : "design-bubble-row design-bubble-row--bottom"
    }
  >
    <RecenterPill />
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

export const ViewportPillEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="pratique"
      components={["ViewportPill"]}
      file="ui/canvas/viewport-pill.tsx"
      note="En Vue, toucher une case de moins de 20 px au doigt ou de 10 px à la souris zoome en douceur sous le doigt, jusqu'à 28 px ou 16 px (un peu moins sur un écran bas), au lieu d'ouvrir l'inspection. Entrer en Dessin ou en sortir ne bouge pas la vue."
      where="En bas à droite · sur mobile, Recentrer seul, quand la vue a bougé · en paysage, contre la colonne du bas · sur un écran tactile large en portrait, au-dessus de la colonne"
    >
      <Block title="États">
        {VIEWPORT_STATES.map(({ name, detail, framing }) => (
          <StateRow key={name} name={name} detail={detail}>
            <ViewportPill
              framing={framing}
              onZoomIn={noop}
              onZoomOut={noop}
              onRecenter={noop}
              isCompact={false}
              isDocked={false}
            />
          </StateRow>
        ))}
      </Block>
      <CursorBlock />
      <Block title="Sur mobile">
        <StateRow name="La vue a bougé">
          <RecenterPill />
        </StateRow>
      </Block>
      <Block
        title="Avec la colonne du bas"
        note="Sur un écran tactile large, la fresque arrive dans la plus grande des deux zones que la colonne lui laisse, mesurées à sa forme : à côté d'elle, ou au-dessus d'elle. Recentrer se pose au coin de cette zone."
      >
        <StateRow name="À côté de la colonne" detail="Un téléphone en paysage, une tablette en paysage.">
          <WithColumn nowMs={nowMs} isAbove={false} />
        </StateRow>
        <StateRow
          name="Au-dessus de la colonne"
          detail="Un pliable déplié ou une tablette en portrait : la fresque garde toute la largeur."
        >
          <WithColumn nowMs={nowMs} isAbove />
        </StateRow>
      </Block>
    </Entry>
  );
};

export const NoticeEntry = () => (
  <Entry
    slug="message-seul"
    components={["NoticePill", "ArchiveNotFound", "CanvasRecovering"]}
    file="ui/design/pill.tsx, ui/archive/archive-not-found.tsx, ui/canvas/canvas-recovering.tsx"
    note="La page d'accueil, une fresque introuvable, une fresque que Redis remet en place, une connexion à Twitch expirée."
    where="Au centre"
  >
    <Block title="États">
      <StateRow name="Fresque introuvable">
        <InNotice>
          <NoticePill title="Ce pseudo n'a pas encore de fresque sur LivePlace.">
            <SignInButton href="#" label="Se connecter avec Twitch" />
            <SignInNote />
          </NoticePill>
        </InNotice>
      </StateRow>
      <StateRow
        name="Fresque en récupération"
        detail="Pour tous, à la place de la fresque ; la page reprend seule. Rien en vue OBS."
      >
        <InNotice>
          <NoticePill title={CANVAS_TEXTS.fr.recovering} />
        </InNotice>
      </StateRow>
      <StateRow
        name="Connexion à Twitch expirée"
        detail="Le retour de Twitch ne vient pas de ce navigateur, ou trop tard : Se connecter recommence."
      >
        <InNotice>
          <SignInExpired />
        </InNotice>
      </StateRow>
      <StateRow name="Une archive supprimée, ou un lien inconnu" detail="Le bouton dit le nom affiché.">
        <InNotice>
          <ArchiveNotFound login="kalyss" displayName={SAMPLE_OWNER.displayName} />
        </InNotice>
      </StateRow>
      <StateRow name="Le pseudo n'existe pas du tout" detail="Le bouton dit le pseudo.">
        <InNotice>
          <ArchiveNotFound login="nobody" />
        </InNotice>
      </StateRow>
    </Block>
  </Entry>
);

// Le chapitre L'écran de jeu : les pills, les vraies, avec des props d'exemple, chacune dans chacun de ses états.

import { PALETTE } from "@liveplace/domain";
import { AccountPill, type AccountPillProps } from "../account/account-pill";
import { ArchiveNotFound } from "../archive/archive-not-found";
import { CanvasPill } from "../canvas/canvas-pill";
import type { Framing } from "../canvas/viewport";
import { ViewportPill } from "../canvas/viewport-pill";
import type { GaugeProps } from "../design/gauge";
import { NoticePill } from "../design/pill";
import { SignInButton, SignInNote } from "../design/twitch";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import { DraftPill, type DraftPillActions, type DraftPillState } from "../draft/draft-pill";
import { noop, SAMPLE_OWNER } from "./design-fixtures";
import { Block, Entry, InNotice, InPhone, StateRow, useNowMs } from "./entry-layout";

const REFILL_MS = 10_000;

export const CanvasPillEntry = () => (
  <Entry
    slug="pill-canvas"
    components={["CanvasPill"]}
    file="ui/canvas/canvas-pill.tsx"
    where="En haut à gauche"
  >
    <Block title="États">
      <StateRow name="Canvas">
        <CanvasPill owner={SAMPLE_OWNER} isDocked={false} />
      </StateRow>
    </Block>
    <Block title="Sur mobile">
      <StateRow name="Version compacte">
        <CanvasPill owner={SAMPLE_OWNER} isCompact isDocked={false} />
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
};

const SIGNED_IN = { kind: "signedIn", user: SAMPLE_OWNER } as const;

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
    title: "Qui modère sur le canvas d'un autre",
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
    title: "Le streamer sur son canvas",
    scenes: [
      {
        name: "Sa seule pill",
        detail: "Réglages ouvre la fenêtre sur Canvas.",
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
      { name: "Invité", identity: { kind: "guest" }, isCompact: true },
      { name: "Le streamer sur son canvas", identity: SIGNED_IN, isCompact: true, hasSettings: true },
      {
        name: "Qui modère, des signalements attendent",
        identity: SIGNED_IN,
        isCompact: true,
        pendingReports: 2,
        hasModeration: true,
      },
    ],
  },
];

export const AccountPillEntry = () => {
  const themeChoice = useThemeChoice();
  return (
    <Entry
      slug="pill-compte"
      components={["AccountPill"]}
      file="ui/account/account-pill.tsx"
      note="Le streamer sur son canvas n'a que la pill Compte."
      where="En haut à droite"
    >
      {ACCOUNT_BLOCKS.map(({ title, scenes }) => (
        <Block key={title} title={title}>
          {scenes.map(
            ({
              name,
              detail,
              identity,
              isCompact,
              pendingReports,
              hasSettings,
              hasModeration,
              isDeveloper,
            }) => (
              <StateRow key={name} name={name} detail={detail}>
                <AccountPill
                  identity={identity}
                  signInHref="#"
                  themeChoice={themeChoice}
                  onPickTheme={pickTheme}
                  onOpenAccount={noop}
                  onOpenSettings={hasSettings ? noop : undefined}
                  onOpenModeration={hasModeration ? noop : undefined}
                  onOpenDeveloper={isDeveloper ? noop : undefined}
                  pendingReports={pendingReports ?? 0}
                  isCompact={isCompact ?? false}
                  isDocked={false}
                />
              </StateRow>
            ),
          )}
        </Block>
      ))}
    </Entry>
  );
};

const DRAFT_ACTIONS: DraftPillActions = {
  onEnter: noop,
  onClaim: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onPickColor: noop,
  onToggleEraser: noop,
  onTogglePicker: noop,
  onToggleTouchTracing: noop,
  onReload: noop,
  onSignIn: noop,
};

const gaugeAt = (nowMs: number, charges: number, draft = 0): GaugeProps => ({
  charges,
  max: 10,
  draft,
  refill: charges < 10 ? { endsAt: nowMs + REFILL_MS / 2, durationMs: REFILL_MS } : null,
  label: `${charges} / 10 charges`,
});

const draftState = (nowMs: number, overrides: Partial<Extract<DraftPillState, { kind: "draft" }>> = {}) =>
  ({
    kind: "draft",
    gauge: gaugeAt(nowMs, 8, 3),
    palette: PALETTE,
    colorIndex: 5,
    recentColorIndexes: [1, 28, 19, 9, 42],
    isSending: false,
    canSubmit: true,
    canDiscard: true,
    isTouchScreen: false,
    isTouchTracing: false,
    isPicking: false,
    ...overrides,
  }) satisfies DraftPillState;

type DraftScene = { name: string; detail?: string; state: DraftPillState };

// Les 18 états de la pill Dessin, par bloc : la connexion, l'invité et le banni, la vue, le dessin, puis le mobile.
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
      { name: "Jauge pleine", state: { kind: "view", gauge: gaugeAt(nowMs, 10), canClaim: false } },
      {
        name: "Une récompense attend",
        detail: "Le +1 prend la place de Dessiner.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 7), canClaim: true },
      },
      {
        name: "Après un refus",
        detail: "La raison, à côté de Dessiner.",
        state: { kind: "view", gauge: gaugeAt(nowMs, 2), canClaim: false, refusal: "rate_limited" },
      },
    ],
  },
  {
    title: "Dessin",
    scenes: [
      { name: "Un brouillon de 3", detail: "La jauge dit ce qui restera.", state: draftState(nowMs) },
      {
        name: "Brouillon vide",
        state: draftState(nowMs, { gauge: gaugeAt(nowMs, 8), canSubmit: false, canDiscard: false }),
      },
      {
        name: "Pendant l'envoi",
        detail: "Verrouillée.",
        state: draftState(nowMs, { isSending: true }),
      },
      { name: "Pipette armée (I)", state: draftState(nowMs, { isPicking: true }) },
      {
        name: "Écran tactile",
        detail: "Tracé armé.",
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
      { name: "Dessin", detail: "La feuille, palette repliée.", state: draftState(nowMs) },
      { name: "Invité", detail: "L'invitation au centre.", state: { kind: "guest", signInHref: "#" } },
    ],
  },
];

export const DraftPillEntry = () => {
  const nowMs = useNowMs();
  return (
    <Entry
      slug="dessin"
      components={["DraftPill"]}
      file="ui/draft/draft-pill.tsx"
      note="La pill du joueur : regarder, réclamer, dessiner, envoyer. La même que dans le jeu, avec des props d'exemple."
      where="En bas au centre · sur mobile, la barre du bas"
    >
      {draftBlocks(nowMs).map(({ title, isCompact = false, scenes }) => (
        <Block key={title} title={title}>
          {scenes.map(({ name, detail, state }) => (
            <StateRow key={name} name={name} detail={detail}>
              {isCompact ? (
                // Sur mobile, la barre du bas prend toute la largeur : ici, celle d'un téléphone.
                <InPhone>
                  <DraftPill state={state} actions={DRAFT_ACTIONS} isCompact isDocked={false} />
                </InPhone>
              ) : (
                <DraftPill state={state} actions={DRAFT_ACTIONS} isCompact={false} isDocked={false} />
              )}
            </StateRow>
          ))}
        </Block>
      ))}
    </Entry>
  );
};

const VIEWPORT_STATES: readonly { name: string; framing: Framing }[] = [
  { name: "À l'arrivée", framing: { zoomPercent: 100, isArrival: true } },
  { name: "Zoomé de près", framing: { zoomPercent: 1250, isArrival: false } },
];

export const ViewportPillEntry = () => (
  <Entry
    slug="pratique"
    components={["ViewportPill"]}
    file="ui/canvas/viewport-pill.tsx"
    where="En bas à droite · sur mobile, Recentrer seul, quand la vue a bougé"
  >
    <Block title="États">
      {VIEWPORT_STATES.map(({ name, framing }) => (
        <StateRow key={name} name={name}>
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
    <Block title="Sur mobile">
      <StateRow name="La vue a bougé">
        <ViewportPill
          framing={{ zoomPercent: 180, isArrival: false }}
          onZoomIn={noop}
          onZoomOut={noop}
          onRecenter={noop}
          isCompact
          isDocked={false}
        />
      </StateRow>
    </Block>
  </Entry>
);

export const NoticeEntry = () => (
  <Entry
    slug="message-seul"
    components={["NoticePill", "ArchiveNotFound"]}
    file="ui/design/pill.tsx, ui/archive/archive-not-found.tsx"
    note="La page d'accueil, un canvas introuvable."
    where="Au centre"
  >
    <Block title="États">
      <StateRow name="Canvas introuvable">
        <InNotice>
          <NoticePill title="Ce pseudo n'a pas encore de canvas sur LivePlace.">
            <SignInButton href="#" label="Se connecter avec Twitch" />
            <SignInNote />
          </NoticePill>
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

// Le chapitre L'écran de jeu : les pills, les vraies, avec des props d'exemple, chacune dans chacun de ses états.

import { PALETTE } from "@liveplace/domain";
import { useState } from "react";
import { AccountPill, type AccountPillProps } from "../account/account-pill";
import { ArchiveNotFound } from "../archive/archive-not-found";
import { CanvasPill } from "../canvas/canvas-pill";
import { RECOVERING_TITLE } from "../canvas/canvas-recovering";
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
import { noop, SAMPLE_LIVE_OWNER, SAMPLE_OWNER } from "./design-fixtures";
import { Block, Entry, InNotice, InPhone, InPhoneTop, InTopRoom, StateRow, useNowMs } from "./entry-layout";

const REFILL_MS = 10_000;

type PhoneHeaderProps = {
  owner: ProfileUser;
  theme?: string | undefined;
  isNarrow?: boolean;
  isDrafting?: boolean;
};

// Le haut d'un téléphone en Vue : la rangée des pills Canvas et Compte, la bande Thème dessous. En Dessin (Écart §8.1, JOURNAL
// 2026-10-08), les deux pills de la rangée sont effacées : seule la bande reste, montée tout en haut.
const PhoneHeader = ({ owner, theme, isNarrow = false, isDrafting = false }: PhoneHeaderProps) => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <InPhoneTop isNarrow={isNarrow}>
      {!isDrafting && (
        <div className="design-phone-row">
          <div className="design-phone-row-start">
            <CanvasPill owner={owner} isCompact isDocked={false} />
          </div>
          <AccountPill
            identity={{ kind: "guest" }}
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
    note="Le thème du canvas, pour tout le monde, dès que le streamer l'a rempli : pas cliquable, et jamais dans la vue OBS ni sur une archive. Sans thème, pas de pill."
    where="En haut au centre, entre les pills Canvas et Compte · sur mobile, une bande sous la rangée des pills du haut, qui monte à leur place en Dessin"
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
        detail="Les pills Canvas et Compte s'effacent en fondu, la bande monte à leur place : seul le thème reste en haut. Sans thème, le haut est vide."
      >
        <PhoneHeader owner={SAMPLE_OWNER} theme={SHORT_THEME} isDrafting />
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
  const appearanceChoice = useAppearanceChoice();
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
                  appearanceChoice={appearanceChoice}
                  onPickAppearance={pickAppearance}
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
    components={["NoticePill", "ArchiveNotFound", "CanvasRecovering"]}
    file="ui/design/pill.tsx, ui/archive/archive-not-found.tsx, ui/canvas/canvas-recovering.tsx"
    note="La page d'accueil, un canvas introuvable, un canvas que Redis remet en place."
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
      <StateRow
        name="Canvas en récupération"
        detail="Pour tous, à la place du canvas ; la page reprend seule. Rien en vue OBS."
      >
        <InNotice>
          <NoticePill title={RECOVERING_TITLE} />
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

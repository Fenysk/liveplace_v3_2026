// Les pills du jeu, les vraies, avec des props d'exemple : chacune dans chacun de ses états.

import { PALETTE } from "@liveplace/domain";
import { useState } from "react";
import type { Inspection } from "../../state/canvas-store";
import { AccountPill, type AccountPillProps } from "../account/account-pill";
import { CanvasPill } from "../canvas/canvas-pill";
import type { Framing } from "../canvas/viewport";
import { ViewportPill } from "../canvas/viewport-pill";
import type { GaugeProps } from "../design/gauge";
import { NoticePill } from "../design/pill";
import { SignInButton } from "../design/twitch";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import { DraftPill, type DraftPillActions, type DraftPillState } from "../draft/draft-pill";
import { InspectionPill } from "../inspection/inspection-pill";
import { noop, SAMPLE_OWNER, SAMPLE_VIEWER } from "./design-fixtures";
import { Specimen, SpecimenSection } from "./specimen-section";

const HOUR = 3_600_000;
const REFILL_MS = 10_000;

const DRAFT_ACTIONS: DraftPillActions = {
  onEnter: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onPickColor: noop,
  onPickRecentColor: noop,
  onToggleEraser: noop,
  onToggleTouchTracing: noop,
  onReload: noop,
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
    recentColorIndexes: [1, 5, 28, 19, 9],
    isSending: false,
    canSubmit: true,
    canDiscard: true,
    isTouchScreen: false,
    isTouchTracing: false,
    ...overrides,
  }) satisfies DraftPillState;

type DraftSpecimen = { caption: string; state: DraftPillState; isCompact?: boolean };

const draftStates = (nowMs: number): readonly DraftSpecimen[] => [
  { caption: "Connexion : floue, Valider bloqué", state: { kind: "connecting" } },
  { caption: "Connexion perdue", state: { kind: "closed" } },
  { caption: "Invité : Dessiner seul", state: { kind: "guest", isSignInPrompted: false, signInHref: "#" } },
  { caption: "Invité, après Dessiner", state: { kind: "guest", isSignInPrompted: true, signInHref: "#" } },
  { caption: "Vue : jauge pleine", state: { kind: "view", gauge: gaugeAt(nowMs, 10) } },
  {
    caption: "Vue, après un refus",
    state: { kind: "view", gauge: gaugeAt(nowMs, 2), refusal: "rate_limited" },
  },
  { caption: "Dessin : un brouillon de 3", state: draftState(nowMs) },
  {
    caption: "Dessin, brouillon vide",
    state: draftState(nowMs, { gauge: gaugeAt(nowMs, 8), canSubmit: false, canDiscard: false }),
  },
  { caption: "Dessin, pendant l'envoi : verrouillée", state: draftState(nowMs, { isSending: true }) },
  {
    caption: "Dessin, écran tactile : Tracé armé",
    state: draftState(nowMs, { isTouchScreen: true, isTouchTracing: true }),
  },
  {
    caption: "Mobile, Vue : la barre du bas",
    state: { kind: "view", gauge: gaugeAt(nowMs, 6) },
    isCompact: true,
  },
  { caption: "Mobile, Dessin : la feuille, palette repliée", state: draftState(nowMs), isCompact: true },
];

const inspections = (nowMs: number): readonly { caption: string; inspection: Inspection }[] => [
  {
    caption: "Un pixel et son auteur",
    inspection: {
      status: "found",
      x: 12,
      y: 40,
      entry: { userId: "1", ...SAMPLE_OWNER, colorIndex: 28, placedAt: nowMs - 3 * HOUR },
    },
  },
  {
    caption: "Un auteur sans photo, une case gommée",
    inspection: {
      status: "found",
      x: 3,
      y: 7,
      entry: { userId: "2", ...SAMPLE_VIEWER, colorIndex: 0, placedAt: nowMs - 90_000 },
    },
  },
  { caption: "Une case jamais posée", inspection: { status: "empty", x: 200, y: 180 } },
];

const ACCOUNT_IDENTITIES: readonly {
  caption: string;
  identity: AccountPillProps["identity"];
  isCompact?: boolean;
}[] = [
  { caption: "Avant la réponse du gateway", identity: { kind: "unknown" } },
  { caption: "Invité", identity: { kind: "guest" } },
  { caption: "Invité, sur mobile", identity: { kind: "guest" }, isCompact: true },
  { caption: "Connecté : sa photo ouvre Mon compte", identity: { kind: "signedIn", user: SAMPLE_OWNER } },
];

const VIEWPORT_SPECIMENS: readonly { caption: string; framing: Framing; isCompact: boolean }[] = [
  { caption: "À l'arrivée", framing: { zoomPercent: 100, isArrival: true }, isCompact: false },
  { caption: "Zoomé de près", framing: { zoomPercent: 1250, isArrival: false }, isCompact: false },
  { caption: "Mobile, la vue a bougé", framing: { zoomPercent: 180, isArrival: false }, isCompact: true },
];

export const GamePillsSection = () => {
  const [nowMs] = useState(() => Date.now());
  const themeChoice = useThemeChoice();
  return (
    <section className="design-section" aria-labelledby="design-game-pills">
      <h2 id="design-game-pills" className="lp-type-heading">
        Les pills du jeu
      </h2>

      <SpecimenSection
        title="Dessin"
        note="En bas au centre. La même pill que dans le jeu, avec des props d'exemple."
      >
        {draftStates(nowMs).map(({ caption, state, isCompact = false }) => (
          <Specimen key={caption} caption={caption}>
            {/* Sur mobile, la barre du bas prend toute la largeur : ici, celle d'un téléphone. */}
            <div className={isCompact ? "design-phone-box" : undefined}>
              <DraftPill state={state} actions={DRAFT_ACTIONS} isCompact={isCompact} isDocked={false} />
            </div>
          </Specimen>
        ))}
      </SpecimenSection>

      <SpecimenSection title="Canvas et Compte" note="En haut à gauche, en haut à droite.">
        <Specimen caption="Canvas">
          <CanvasPill owner={SAMPLE_OWNER} isDocked={false} />
        </Specimen>
        <Specimen caption="Canvas, sur mobile">
          <CanvasPill owner={SAMPLE_OWNER} isCompact isDocked={false} />
        </Specimen>
        {ACCOUNT_IDENTITIES.map(({ caption, identity, isCompact }) => (
          <Specimen key={caption} caption={caption}>
            <AccountPill
              identity={identity}
              signInHref="#"
              signOutHref="#"
              themeChoice={themeChoice}
              onPickTheme={pickTheme}
              isCompact={isCompact ?? false}
              isDocked={false}
            />
          </Specimen>
        ))}
      </SpecimenSection>

      <SpecimenSection
        title="Inspection"
        note="Au centre à droite, seulement pendant une inspection, en mode Vue."
      >
        {inspections(nowMs).map(({ caption, inspection }) => (
          <Specimen key={caption} caption={caption}>
            <InspectionPill
              inspection={inspection}
              palette={PALETTE}
              nowMs={nowMs}
              onClose={noop}
              isDocked={false}
            />
          </Specimen>
        ))}
      </SpecimenSection>

      <SpecimenSection
        title="Pratique"
        note="En bas à droite. Sur mobile, Recentrer seul, quand la vue a bougé."
      >
        {VIEWPORT_SPECIMENS.map(({ caption, framing, isCompact }) => (
          <Specimen key={caption} caption={caption}>
            <ViewportPill
              framing={framing}
              onZoomIn={noop}
              onZoomOut={noop}
              onRecenter={noop}
              isCompact={isCompact}
              isDocked={false}
            />
          </Specimen>
        ))}
      </SpecimenSection>

      <SpecimenSection title="Message seul" note="La page d'accueil, un canvas introuvable.">
        <Specimen caption="NoticePill">
          <div className="design-notice-box">
            <NoticePill title="Ce pseudo n'a pas encore de canvas sur LivePlace.">
              <SignInButton href="#" label="Se connecter avec Twitch" />
            </NoticePill>
          </div>
        </Specimen>
      </SpecimenSection>
    </section>
  );
};

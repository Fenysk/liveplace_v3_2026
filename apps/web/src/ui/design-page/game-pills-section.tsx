// Les pills du jeu, les vraies, avec des props d'exemple : chacune dans chacun de ses états.

import { PALETTE } from "@liveplace/domain";
import { useState } from "react";
import type { Inspection } from "../../state/canvas-store";
import { AccountPill, type AccountPillProps } from "../account/account-pill";
import { CanvasPill } from "../canvas/canvas-pill";
import { CanvasSettings, type ResizeStatus, ResizeWindow } from "../canvas/canvas-settings";
import { type SizeChoice, toCanvasSize } from "../canvas/canvas-size";
import type { Framing } from "../canvas/viewport";
import { ViewportPill } from "../canvas/viewport-pill";
import type { GaugeProps } from "../design/gauge";
import { NoticePill } from "../design/pill";
import { SignInButton, SignInNote } from "../design/twitch";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import { DraftPill, type DraftPillActions, type DraftPillState } from "../draft/draft-pill";
import { InspectionPill, type ReportControl } from "../inspection/inspection-pill";
import { ObsSettings } from "../obs/obs-settings";
import { noop, SAMPLE_CANVAS, SAMPLE_DRAWING, SAMPLE_OWNER, SAMPLE_VIEWER } from "./design-fixtures";
import { Specimen, SpecimenSection } from "./specimen-section";

const HOUR = 3_600_000;
const REFILL_MS = 10_000;

const DRAFT_ACTIONS: DraftPillActions = {
  onEnter: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onPickColor: noop,
  onToggleEraser: noop,
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
    ...overrides,
  }) satisfies DraftPillState;

type DraftSpecimen = { caption: string; state: DraftPillState; isCompact?: boolean };

const draftStates = (nowMs: number): readonly DraftSpecimen[] => [
  { caption: "Connexion : floue, Valider bloqué", state: { kind: "connecting" } },
  { caption: "Connexion perdue pour de bon", state: { kind: "closed" } },
  {
    caption: "Reconnexion, en Dessin : son contenu flouté, rien n'y répond",
    state: { kind: "reconnecting", shown: draftState(nowMs) },
  },
  { caption: "Banni : lecture seule", state: { kind: "banned" } },
  { caption: "Invité : l'invitation, directement", state: { kind: "guest", signInHref: "#" } },
  {
    caption: "Invité, parti chez Twitch : Connexion à Twitch",
    state: { kind: "signingIn", signInHref: "#" },
  },
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
  {
    caption: "Mobile, invité : l'invitation au centre",
    state: { kind: "guest", signInHref: "#" },
    isCompact: true,
  },
];

const inspections = (
  nowMs: number,
): readonly { caption: string; inspection: Inspection; report?: ReportControl }[] => [
  {
    caption: "Un pixel et son auteur",
    inspection: {
      status: "found",
      x: 12,
      y: 40,
      entry: {
        userId: "1",
        ...SAMPLE_OWNER,
        colorIndex: 28,
        placedAt: nowMs - 3 * HOUR,
        placementId: "pdemo0001",
      },
    },
  },
  {
    caption: "Un auteur sans photo, une case gommée",
    inspection: {
      status: "found",
      x: 3,
      y: 7,
      entry: {
        userId: "2",
        ...SAMPLE_VIEWER,
        colorIndex: 0,
        placedAt: nowMs - 90_000,
        placementId: "pdemo0002",
      },
    },
  },
  {
    caption: "La pose d'un autre : Signaler",
    inspection: {
      status: "found",
      x: 122,
      y: 82,
      entry: {
        ...SAMPLE_VIEWER,
        colorIndex: 5,
        placedAt: nowMs - 90_000,
        placementId: "pdemo0003",
        canReport: true,
      },
    },
    report: { status: "available", onReport: noop },
  },
  {
    caption: "Une fois signalée",
    inspection: {
      status: "found",
      x: 122,
      y: 82,
      entry: { ...SAMPLE_VIEWER, colorIndex: 5, placedAt: nowMs - 90_000, placementId: "pdemo0003" },
    },
    report: { status: "reported", onReport: noop },
  },
  { caption: "Une case jamais posée", inspection: { status: "empty", x: 200, y: 180 } },
];

const ACCOUNT_IDENTITIES: readonly {
  caption: string;
  identity: AccountPillProps["identity"];
  isCompact?: boolean;
  pendingReports?: number;
}[] = [
  { caption: "Avant la réponse du gateway", identity: { kind: "unknown" } },
  { caption: "Invité", identity: { kind: "guest" } },
  { caption: "Invité, sur mobile", identity: { kind: "guest" }, isCompact: true },
  { caption: "Connecté : sa photo ouvre Mon compte", identity: { kind: "signedIn", user: SAMPLE_OWNER } },
  {
    caption: "Qui modère, un signalement attend : sa photo ouvre Modération",
    identity: { kind: "signedIn", user: SAMPLE_OWNER },
    pendingReports: 2,
  },
];

const VIEWPORT_SPECIMENS: readonly { caption: string; framing: Framing; isCompact: boolean }[] = [
  { caption: "À l'arrivée", framing: { zoomPercent: 100, isArrival: true }, isCompact: false },
  { caption: "Zoomé de près", framing: { zoomPercent: 1250, isArrival: false }, isCompact: false },
  { caption: "Mobile, la vue a bougé", framing: { zoomPercent: 180, isArrival: false }, isCompact: true },
];

// La section Canvas : le format et la taille se choisissent ; Changer la taille ouvre la confirmation, qui montre ce
// qui sort du cadre (le petit dessin d'exemple, placé au bord d'un canvas de 256).
const CanvasSettingsSpecimen = () => {
  const [choice, setChoice] = useState<SizeChoice>({ format: "1:1", sizeIndex: 1 });
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<ResizeStatus>("idle");
  const current = { width: 256, height: 256 };
  const chosen = toCanvasSize(choice);
  const outside = SAMPLE_DRAWING.filter(({ x, y }) => x >= chosen.width || y >= chosen.height);
  return (
    <Specimen caption="Un format, puis Petit, Moyen ou Grand ; la confirmation montre ce qui sort du cadre">
      <div className="design-window-box">
        <CanvasSettings
          current={current}
          choice={choice}
          chosen={chosen}
          onChoose={setChoice}
          onApply={() => {
            setStatus("idle");
            setIsConfirming(true);
          }}
        />
      </div>
      <ResizeWindow
        next={isConfirming ? chosen : null}
        outside={outside}
        status={status}
        canvas={SAMPLE_CANVAS}
        onConfirm={() => {
          setStatus("running");
          setTimeout(() => setIsConfirming(false), 1500);
        }}
        onClose={() => setIsConfirming(false)}
      />
    </Specimen>
  );
};

// Le vrai curseur : un cran choisi s'affiche, comme le ferait la confirmation du gateway.
const ObsSettingsSpecimen = () => {
  const [obsDelayMs, setObsDelayMs] = useState(10_000);
  return (
    <Specimen caption="L'adresse, la marche à suivre et le délai">
      <div className="design-window-box">
        <ObsSettings
          address="liveplace.tv/kalyss"
          url="https://liveplace.tv/kalyss"
          obsDelayMs={obsDelayMs}
          onPickDelay={setObsDelayMs}
        />
      </div>
    </Specimen>
  );
};

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
        <Specimen caption="Canvas, pour le streamer : Réglages ouvre la fenêtre sur Vue OBS">
          <CanvasPill owner={SAMPLE_OWNER} onOpenSettings={noop} isDocked={false} />
        </Specimen>
        {ACCOUNT_IDENTITIES.map(({ caption, identity, isCompact, pendingReports }) => (
          <Specimen key={caption} caption={caption}>
            <AccountPill
              identity={identity}
              signInHref="#"
              themeChoice={themeChoice}
              onPickTheme={pickTheme}
              onOpenAccount={noop}
              pendingReports={pendingReports ?? 0}
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
        {inspections(nowMs).map(({ caption, inspection, report }) => (
          <Specimen key={caption} caption={caption}>
            <InspectionPill
              inspection={inspection}
              palette={PALETTE}
              nowMs={nowMs}
              onClose={noop}
              report={report}
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

      <SpecimenSection
        title="Fenêtre, section Canvas"
        note="Pour le streamer : la taille du canvas, sans rien perdre."
      >
        <CanvasSettingsSpecimen />
      </SpecimenSection>

      <SpecimenSection
        title="Fenêtre, section Vue OBS"
        note="Pour le streamer : l'adresse, la marche à suivre, le délai."
      >
        <ObsSettingsSpecimen />
      </SpecimenSection>

      <SpecimenSection title="Message seul" note="La page d'accueil, un canvas introuvable.">
        <Specimen caption="NoticePill">
          <div className="design-notice-box">
            <NoticePill title="Ce pseudo n'a pas encore de canvas sur LivePlace.">
              <SignInButton href="#" label="Se connecter avec Twitch" />
              <SignInNote />
            </NoticePill>
          </div>
        </Specimen>
      </SpecimenSection>
    </section>
  );
};

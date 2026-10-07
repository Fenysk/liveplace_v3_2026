// La pill Dessin (CDC 2026), en bas au centre : l'affichage seul, nourri par `useDraftPillProps` (JOURNAL 2026-09-24).
// Vue : la jauge et Dessiner, ou le +1 quand une récompense attend (JOURNAL 2026-09-30). Dessin : la palette, puis la jauge, Vider, Annuler, Valider. Invité : l'invitation.
// Sur mobile, en Dessin : une feuille à poignée, la palette complète repliée (design system, Mobile).

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { Brush, Eraser, Pipette, Trash } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { ClaimButton, Gauge, type GaugeProps } from "../design/gauge";
import { Grabber } from "../design/grabber";
import { CurrentColorButton, Palette, RecentSwatches } from "../design/palette";
import { Pill, type PillDock, type PillLayout, type PillState } from "../design/pill";
import { SignInButton, SignInNote } from "../design/twitch";
import { useTexts } from "../locale/use-locale";
import { DRAFT_TEXTS, type DraftTexts, type RefusalCode } from "./draft-texts";

export type DraftPillState =
  | { kind: "connecting" }
  | { kind: "closed" } // pour de bon : on recharge la page
  | { kind: "reconnecting"; shown: Exclude<DraftPillState, { kind: "reconnecting" }> } // son contenu, flouté (§4.5)
  | { kind: "banned" } // lecture seule (§10.2, JOURNAL 2026-09-25)
  | { kind: "guest"; signInHref: string } // l'invitation à se connecter, directement (CDC 2026)
  | { kind: "signingIn"; signInHref: string } // parti chez Twitch : l'invitation, en attente
  | { kind: "view"; gauge: GaugeProps; canClaim: boolean; refusal?: RefusalCode }
  | {
      kind: "draft";
      gauge: GaugeProps;
      palette: readonly string[];
      colorIndex: number;
      recentColorIndexes: readonly number[]; // sur mobile, la rangée : jamais la couleur du bouton
      isSending: boolean;
      canSubmit: boolean;
      canDiscard: boolean;
      isTouchScreen: boolean;
      isTouchTracing: boolean;
      isPicking: boolean;
      refusal?: RefusalCode;
    };

export type DraftPillActions = {
  onEnter: () => void; // Dessiner
  onClaim: () => void; // +1 de jauge max (JOURNAL 2026-09-30)
  onExit: () => void; // Annuler : sort du Dessin
  onSubmit: () => void;
  onDiscard: () => void;
  onPickColor: (colorIndex: number) => void; // dans la palette, ou dans la rangée des récentes sur mobile
  onToggleEraser: () => void;
  onTogglePicker: () => void; // la pipette, pour un seul clic (CDC 2026, `I`)
  onToggleTouchTracing: () => void;
  onReload: () => void;
  onSignIn: () => void; // la page part chez Twitch
};

type DraftPillProps = {
  state: DraftPillState;
  actions: DraftPillActions;
  isCompact?: boolean; // écran étroit ou tactile : la barre du bas, et la feuille en Dessin
  isDocked?: boolean;
};

type DraftModeState = Extract<DraftPillState, { kind: "draft" }>;

// Ce que la pill montre dans un état : son contenu, sa disposition, son voile.
type DraftPillContent = {
  content: ReactNode;
  layout?: PillLayout | undefined;
  pillState?: PillState | undefined;
};

const DOCK: PillDock = "bc";

const Refusal = ({ code }: { code: RefusalCode | undefined }) => {
  const t = useTexts(DRAFT_TEXTS);
  return code ? <span className="lp-type-caption lp-danger">{t.refusal(code)}</span> : null;
};

const EnterButton = ({ onEnter }: Pick<DraftPillActions, "onEnter">) => {
  const t = useTexts(DRAFT_TEXTS);
  return <Button label={t.draw} kbd="D" variant="primary" title={t.drawTip} onPress={onEnter} />;
};

const CancelButton = ({ onExit }: Pick<DraftPillActions, "onExit">) => {
  const t = useTexts(DRAFT_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  return <Button label={design.cancel} kbd={design.escapeKey} title={t.cancelTip} onPress={onExit} />;
};

const SubmitButton = ({ canSubmit, onSubmit }: { canSubmit: boolean; onSubmit: () => void }) => {
  const t = useTexts(DRAFT_TEXTS);
  return (
    <Button
      label={t.confirm}
      kbd="⏎"
      variant="primary"
      title={t.confirmTip}
      isDisabled={!canSubmit}
      onPress={onSubmit}
    />
  );
};

const DiscardButton = ({ canDiscard, onDiscard }: { canDiscard: boolean; onDiscard: () => void }) => {
  const t = useTexts(DRAFT_TEXTS);
  return (
    <Button
      icon={Trash}
      variant="ghost"
      title={t.clearDraftTip}
      isDisabled={!canDiscard}
      onPress={onDiscard}
    />
  );
};

const TraceButton = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => {
  const t = useTexts(DRAFT_TEXTS);
  return (
    <Button
      icon={Brush}
      variant="ghost"
      title={t.traceTip}
      isPressed={state.isTouchTracing}
      onPress={actions.onToggleTouchTracing}
    />
  );
};

const PickerButton = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => {
  const t = useTexts(DRAFT_TEXTS);
  return (
    <Button
      icon={Pipette}
      variant="ghost"
      title={t.eyedropperTip}
      isPressed={state.isPicking}
      onPress={actions.onTogglePicker}
    />
  );
};

// La feuille Dessin, sur mobile. Repliée ou dépliée, c'est son affaire : elle repart repliée à chaque entrée en Dessin.
const DraftSheet = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => {
  const t = useTexts(DRAFT_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const [isExpanded, setIsExpanded] = useState(false);
  const isEraser = state.colorIndex === TRANSPARENT_COLOR_INDEX;
  const toggle = () => setIsExpanded((expanded) => !expanded);
  // Choisir une couleur replie la feuille (design system, Mobile).
  const pickColor = (colorIndex: number) => {
    actions.onPickColor(colorIndex);
    setIsExpanded(false);
  };
  return (
    <>
      <Grabber
        label={isExpanded ? t.collapseSheet : t.expandPalette}
        onUp={() => setIsExpanded(true)}
        onDown={() => setIsExpanded(false)}
        onTap={toggle}
      />
      <div className="lp-row">
        <Gauge {...state.gauge} isFill />
        <CancelButton onExit={actions.onExit} />
        <SubmitButton canSubmit={state.canSubmit} onSubmit={actions.onSubmit} />
      </div>
      {/* La palette complète dépliée remplace toute la rangée : elle revient quand la palette se replie. */}
      {!isExpanded && (
        <div className="lp-row">
          {/* La couleur active ouvre la palette. Toucher une récente l'échange avec elle, sur place. */}
          <CurrentColorButton
            color={isEraser ? undefined : state.palette[state.colorIndex]}
            onPress={toggle}
          />
          <RecentSwatches
            palette={state.palette}
            recentColorIndexes={state.recentColorIndexes}
            onPick={actions.onPickColor}
          />
        </div>
      )}
      <div className="lp-row lp-sheet-tools">
        <Button
          icon={Eraser}
          variant="ghost"
          title={design.eraser}
          isPressed={isEraser}
          onPress={actions.onToggleEraser}
        />
        <PickerButton state={state} actions={actions} />
        <TraceButton state={state} actions={actions} />
        <DiscardButton canDiscard={state.canDiscard} onDiscard={actions.onDiscard} />
      </div>
      {isExpanded && (
        <Palette
          palette={state.palette}
          colorIndex={state.colorIndex}
          onPick={pickColor}
          isTouch
          hasEraser={false}
        />
      )}
      <Refusal code={state.refusal} />
    </>
  );
};

// Un seul bouton, qui dit tout. Empilée : au téléphone, la barre prend toute la largeur, et le bouton aussi.
const guestContent = (signInHref: string, onSignIn: () => void, t: DraftTexts): DraftPillContent => ({
  layout: "stack",
  content: (
    <div className="lp-invitation">
      <SignInButton href={signInHref} label={t.signInToDraw} onPress={onSignIn} />
      <SignInNote />
    </div>
  ),
});

const draftContent = (
  state: DraftModeState,
  actions: DraftPillActions,
  isCompact: boolean,
): DraftPillContent => ({
  layout: "stack",
  pillState: state.isSending ? { kind: "locked" } : undefined,
  content: isCompact ? (
    <DraftSheet state={state} actions={actions} />
  ) : (
    <>
      <Palette palette={state.palette} colorIndex={state.colorIndex} onPick={actions.onPickColor} />
      <div className="lp-row">
        <Gauge {...state.gauge} />
        <span className="lp-spacer" />
        {state.isTouchScreen && <TraceButton state={state} actions={actions} />}
        <PickerButton state={state} actions={actions} />
        <DiscardButton canDiscard={state.canDiscard} onDiscard={actions.onDiscard} />
        <CancelButton onExit={actions.onExit} />
        <SubmitButton canSubmit={state.canSubmit} onSubmit={actions.onSubmit} />
      </div>
      <Refusal code={state.refusal} />
    </>
  ),
});

const contentOf = (
  state: DraftPillState,
  actions: DraftPillActions,
  isCompact: boolean,
  t: DraftTexts,
): DraftPillContent => {
  switch (state.kind) {
    case "connecting":
      return {
        content: <EnterButton onEnter={actions.onEnter} />,
        pillState: { kind: "reconnecting", label: t.connecting },
      };
    case "reconnecting":
      return {
        ...contentOf(state.shown, actions, isCompact, t),
        pillState: { kind: "reconnecting", label: t.reconnecting },
      };
    case "closed":
      return {
        content: (
          <>
            <span className="lp-type-body lp-prompt">{t.connectionLost}</span>
            <Button label={t.reload} onPress={actions.onReload} />
          </>
        ),
      };
    case "banned":
      return { content: <span className="lp-type-body lp-prompt">{t.banned}</span> };
    case "guest":
      return guestContent(state.signInHref, actions.onSignIn, t);
    case "signingIn":
      return {
        ...guestContent(state.signInHref, actions.onSignIn, t),
        pillState: { kind: "reconnecting", label: t.connectingToTwitch },
      };
    case "view":
      return {
        content: (
          <>
            <Gauge {...state.gauge} isFill={isCompact} />
            {state.canClaim ? (
              <ClaimButton onClaim={actions.onClaim} />
            ) : (
              <EnterButton onEnter={actions.onEnter} />
            )}
            <Refusal code={state.refusal} />
          </>
        ),
      };
    case "draft":
      return draftContent(state, actions, isCompact);
  }
};

export const DraftPill = ({ state, actions, isCompact = false, isDocked = true }: DraftPillProps) => {
  const t = useTexts(DRAFT_TEXTS);
  const { content, layout, pillState } = contentOf(state, actions, isCompact, t);
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout={layout} state={pillState}>
      {content}
    </Pill>
  );
};

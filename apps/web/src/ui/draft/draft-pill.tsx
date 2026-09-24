// La pill Dessin (CDC 2026), en bas au centre : l'affichage seul, nourri par `useDraftPillProps` (JOURNAL 2026-09-24).
// Vue : la jauge et Dessiner. Dessin : la palette, puis la jauge, Vider, Annuler, Valider.
// Sur mobile, en Dessin : une feuille à poignée, la palette complète repliée (design system, Mobile).

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { Brush, Eraser, LogIn, Palette as PaletteIcon, Trash } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../design/button";
import { Gauge, type GaugeProps } from "../design/gauge";
import { Grabber } from "../design/grabber";
import { Palette, RecentSwatches } from "../design/palette";
import { Pill, type PillDock, type PillLayout, type PillState } from "../design/pill";

export type DraftPillState =
  | { kind: "connecting" }
  | { kind: "closed" } // la reconnexion arrive au J12 : on recharge la page
  | { kind: "guest"; isSignInPrompted: boolean; signInHref: string }
  | { kind: "view"; gauge: GaugeProps; refusal?: string }
  | {
      kind: "draft";
      gauge: GaugeProps;
      palette: readonly string[];
      colorIndex: number;
      recentColorIndexes: readonly number[]; // sur mobile
      isSending: boolean;
      canSubmit: boolean;
      canDiscard: boolean;
      isTouchScreen: boolean;
      isTouchTracing: boolean;
      refusal?: string;
    };

export type DraftPillActions = {
  onEnter: () => void; // Dessiner, ou l'invitation d'un invité
  onExit: () => void; // Annuler : sort du Dessin, ou referme l'invitation
  onSubmit: () => void;
  onDiscard: () => void;
  onPickColor: (colorIndex: number) => void; // dans la palette
  onPickRecentColor: (colorIndex: number) => void; // parmi les récentes, sur mobile
  onToggleEraser: () => void;
  onToggleTouchTracing: () => void;
  onReload: () => void;
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

const Refusal = ({ code }: { code: string | undefined }) =>
  code ? <span className="lp-type-caption lp-danger">Refusé : {code}</span> : null;

const EnterButton = ({ onEnter }: Pick<DraftPillActions, "onEnter">) => (
  <Button label="Dessiner" kbd="D" variant="primary" title="Passer en mode Dessin" onPress={onEnter} />
);

const CancelButton = ({ onExit }: Pick<DraftPillActions, "onExit">) => (
  <Button
    label="Annuler"
    kbd="Échap"
    title="Sortir du mode Dessin (le brouillon est gardé)"
    onPress={onExit}
  />
);

const SubmitButton = ({ canSubmit, onSubmit }: { canSubmit: boolean; onSubmit: () => void }) => (
  <Button
    label="Valider"
    kbd="⏎"
    variant="primary"
    title="Poser le brouillon"
    isDisabled={!canSubmit}
    onPress={onSubmit}
  />
);

const DiscardButton = ({ canDiscard, onDiscard }: { canDiscard: boolean; onDiscard: () => void }) => (
  <Button
    icon={Trash}
    variant="ghost"
    title="Vider le brouillon"
    isDisabled={!canDiscard}
    onPress={onDiscard}
  />
);

const TraceButton = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => (
  <Button
    icon={Brush}
    variant="ghost"
    title="Tracé : un doigt dessine, deux doigts déplacent"
    isPressed={state.isTouchTracing}
    onPress={actions.onToggleTouchTracing}
  />
);

// La feuille Dessin, sur mobile. Repliée ou dépliée, c'est son affaire : elle repart repliée à chaque entrée en Dessin.
const DraftSheet = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => {
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
        label={isExpanded ? "Réduire la feuille" : "Déplier la palette"}
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
          {/* La couleur active est l'une des récentes, entourée : pas de bouton de couleur actuelle en doublon. */}
          <RecentSwatches
            palette={state.palette}
            recentColorIndexes={state.recentColorIndexes}
            colorIndex={state.colorIndex}
            onPick={actions.onPickRecentColor}
          />
          <Button icon={PaletteIcon} variant="ghost" title="Toutes les couleurs" onPress={toggle} />
        </div>
      )}
      <div className="lp-row lp-sheet-tools">
        <Button
          icon={Eraser}
          variant="ghost"
          title="Gomme"
          isPressed={isEraser}
          onPress={actions.onToggleEraser}
        />
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

const guestContent = (
  state: Extract<DraftPillState, { kind: "guest" }>,
  actions: DraftPillActions,
): DraftPillContent => {
  if (!state.isSignInPrompted) return { content: <EnterButton onEnter={actions.onEnter} /> };
  return {
    layout: "stack",
    content: (
      <>
        <p className="lp-type-body lp-prompt">Connecte-toi avec Twitch pour dessiner.</p>
        <div className="lp-row">
          <span className="lp-spacer" />
          <CancelButton onExit={actions.onExit} />
          <Button label="Se connecter" icon={LogIn} variant="primary" href={state.signInHref} />
        </div>
      </>
    ),
  };
};

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
): DraftPillContent => {
  switch (state.kind) {
    case "connecting":
      return {
        content: <EnterButton onEnter={actions.onEnter} />,
        pillState: { kind: "reconnecting", label: "Connexion" },
      };
    case "closed":
      return {
        content: (
          <>
            <span className="lp-type-body lp-prompt">Connexion perdue</span>
            <Button label="Recharger" onPress={actions.onReload} />
          </>
        ),
      };
    case "guest":
      return guestContent(state, actions);
    case "view":
      return {
        content: (
          <>
            <Gauge {...state.gauge} isFill={isCompact} />
            <EnterButton onEnter={actions.onEnter} />
            <Refusal code={state.refusal} />
          </>
        ),
      };
    case "draft":
      return draftContent(state, actions, isCompact);
  }
};

export const DraftPill = ({ state, actions, isCompact = false, isDocked = true }: DraftPillProps) => {
  const { content, layout, pillState } = contentOf(state, actions, isCompact);
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout={layout} state={pillState}>
      {content}
    </Pill>
  );
};

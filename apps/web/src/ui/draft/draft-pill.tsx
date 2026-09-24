// La pill Dessin (CDC 2026), en bas au centre : l'affichage seul, nourri par `useDraftPillProps` (JOURNAL 2026-09-24).
// Vue : la jauge et Dessiner. Dessin : la palette, puis la jauge, Vider, Annuler, Valider.

import { Brush, LogIn, Trash } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";
import { Gauge, type GaugeProps } from "../design/gauge";
import { Palette } from "../design/palette";
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
  onPickColor: (colorIndex: number) => void;
  onToggleTouchTracing: () => void;
  onReload: () => void;
};

type DraftPillProps = { state: DraftPillState; actions: DraftPillActions; isDocked?: boolean };

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
  state: Extract<DraftPillState, { kind: "draft" }>,
  actions: DraftPillActions,
): DraftPillContent => ({
  layout: "stack",
  pillState: state.isSending ? { kind: "locked" } : undefined,
  content: (
    <>
      <Palette palette={state.palette} colorIndex={state.colorIndex} onPick={actions.onPickColor} />
      <div className="lp-row">
        <Gauge {...state.gauge} />
        <span className="lp-spacer" />
        {state.isTouchScreen && (
          <Button
            icon={Brush}
            variant="ghost"
            title="Tracé : un doigt dessine, deux doigts déplacent"
            isPressed={state.isTouchTracing}
            onPress={actions.onToggleTouchTracing}
          />
        )}
        <Button
          icon={Trash}
          variant="ghost"
          title="Vider le brouillon"
          isDisabled={!state.canDiscard}
          onPress={actions.onDiscard}
        />
        <CancelButton onExit={actions.onExit} />
        <Button
          label="Valider"
          kbd="⏎"
          variant="primary"
          title="Poser le brouillon"
          isDisabled={!state.canSubmit}
          onPress={actions.onSubmit}
        />
      </div>
      <Refusal code={state.refusal} />
    </>
  ),
});

const contentOf = (state: DraftPillState, actions: DraftPillActions): DraftPillContent => {
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
            <Gauge {...state.gauge} />
            <EnterButton onEnter={actions.onEnter} />
            <Refusal code={state.refusal} />
          </>
        ),
      };
    case "draft":
      return draftContent(state, actions);
  }
};

export const DraftPill = ({ state, actions, isDocked = true }: DraftPillProps) => {
  const { content, layout, pillState } = contentOf(state, actions);
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout={layout} state={pillState}>
      {content}
    </Pill>
  );
};

// La pill Dessin (CDC 2026), en bas au centre : l'affichage seul, nourri par `useDraftPillProps` (JOURNAL 2026-09-24).
// Vue : la jauge et Dessiner, ou le +1 quand une récompense attend, qui s'étire comme lui (Écart §9.3, JOURNAL 2026-10-09).
// Dessin : la palette, puis la jauge, Vider (seulement avec un brouillon), Annuler, Valider (sa taille, ou l'attente d'une charge).
// Les boutons suivent le brouillon et la jauge, et leur largeur glisse (Écart §9.3, JOURNAL 2026-10-08). Invité : l'invitation.
// Sur mobile, en Dessin : une feuille à poignée, la palette complète repliée (design system, Mobile). En paysage sur un écran bas,
// un panneau sur le côté : sans poignée, la palette complète dedans (Écart §8.1, JOURNAL 2026-10-08).

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { Brush, Eraser, Pipette, Trash } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../design/button";
import { ClaimButton, Gauge, type GaugeProps } from "../design/gauge";
import { Grabber } from "../design/grabber";
import { CurrentColorButton, Palette, RecentSwatches } from "../design/palette";
import { Pill, type PillDock, type PillLayout, type PillState } from "../design/pill";
import { Reveal } from "../design/reveal";
import { SignInButton, SignInNote } from "../design/twitch";
import { BubbleTarget } from "../help/bubble-target";
import { ENTER_LABEL, submitWords } from "./draft-labels";

export type DraftPillState =
  | { kind: "connecting" }
  | { kind: "closed" } // pour de bon : on recharge la page
  | { kind: "reconnecting"; shown: Exclude<DraftPillState, { kind: "reconnecting" }> } // son contenu, flouté (§4.5)
  | { kind: "banned" } // lecture seule (§10.2, JOURNAL 2026-09-25)
  | { kind: "guest"; signInHref: string } // l'invitation à se connecter, directement (CDC 2026)
  | { kind: "signingIn"; signInHref: string } // parti chez Twitch : l'invitation, en attente
  | { kind: "view"; gauge: GaugeProps; canClaim: boolean; refusal?: string }
  | {
      kind: "draft";
      gauge: GaugeProps;
      palette: readonly string[];
      colorIndex: number;
      recentColorIndexes: readonly number[]; // sur mobile, la rangée : jamais la couleur du bouton
      isSending: boolean;
      draftSize: number; // les pixels du brouillon : dans Valider, et Vider n'est là qu'avec eux
      waitSeconds?: number; // plus aucune charge et rien à poser : Valider attend la prochaine
      canSubmit: boolean;
      canDiscard: boolean;
      isTouchScreen: boolean;
      isTouchTracing: boolean;
      isPicking: boolean;
      refusal?: string;
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
  isSidePanel?: boolean; // paysage sur un écran bas : la barre est une colonne sur le côté, la feuille un panneau
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
  <Button label={ENTER_LABEL} kbd="D" variant="primary" title="Passer en mode Dessin" onPress={onEnter} />
);

const CancelButton = ({ onExit }: Pick<DraftPillActions, "onExit">) => (
  <Button
    label="Annuler"
    kbd="Échap"
    title="Sortir du mode Dessin (le brouillon est gardé)"
    onPress={onExit}
  />
);

// Dans l'attente, plus de raccourci : Entrée ne poserait rien.
const SubmitButton = ({ state, onSubmit }: { state: DraftModeState; onSubmit: () => void }) => {
  const isWaiting = state.waitSeconds !== undefined;
  const { lead, label } = submitWords(state.draftSize, state.waitSeconds);
  return (
    <BubbleTarget name="submit">
      <Button
        label={label}
        labelLead={lead}
        {...(isWaiting ? {} : { kbd: "⏎" })}
        variant="primary"
        title={isWaiting ? "Attendre la prochaine charge" : "Poser le brouillon"}
        isDisabled={!state.canSubmit}
        hasMorphingLabel
        onPress={onSubmit}
      />
    </BubbleTarget>
  );
};

// Vider n'est là qu'avec un brouillon : il paraît au premier pixel et s'efface avec le dernier.
const DiscardButton = ({
  state,
  isSpread = false,
  onDiscard,
}: {
  state: DraftModeState;
  isSpread?: boolean;
  onDiscard: () => void;
}) => (
  <Reveal isOpen={state.draftSize > 0} isSpread={isSpread}>
    <Button
      icon={Trash}
      variant="ghost"
      title="Vider le brouillon"
      isDisabled={!state.canDiscard}
      onPress={onDiscard}
    />
  </Reveal>
);

const TraceButton = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => (
  <BubbleTarget name="trace">
    <Button
      icon={Brush}
      variant="ghost"
      title="Tracé : un doigt dessine, deux doigts déplacent"
      isPressed={state.isTouchTracing}
      onPress={actions.onToggleTouchTracing}
    />
  </BubbleTarget>
);

const PickerButton = ({ state, actions }: { state: DraftModeState; actions: DraftPillActions }) => (
  <Button
    icon={Pipette}
    variant="ghost"
    title="Pipette (I) : prend la couleur d'un pixel posé"
    isPressed={state.isPicking}
    onPress={actions.onTogglePicker}
  />
);

// La jauge, que la bulle de la jauge vide vise (Écart §8.1, JOURNAL 2026-10-08).
const PillGauge = ({ gauge, isFill = false }: { gauge: GaugeProps; isFill?: boolean }) => (
  <BubbleTarget name="gauge">
    <Gauge {...gauge} isFill={isFill} />
  </BubbleTarget>
);

// La feuille Dessin, sur mobile. Repliée ou dépliée, c'est son affaire : elle repart repliée à chaque entrée en Dessin.
// Panneau : toujours dépliée, sans poignée ni couleurs récentes, la palette y défile sous les outils (pill-landscape.css).
type DraftSheetProps = { state: DraftModeState; actions: DraftPillActions; isPanel: boolean };

const DraftSheet = ({ state, actions, isPanel }: DraftSheetProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOpen = isPanel || isExpanded;
  const isEraser = state.colorIndex === TRANSPARENT_COLOR_INDEX;
  const toggle = () => setIsExpanded((expanded) => !expanded);
  return (
    <>
      {!isPanel && (
        <Grabber
          label={isExpanded ? "Réduire la feuille" : "Déplier la palette"}
          onUp={() => setIsExpanded(true)}
          onDown={() => setIsExpanded(false)}
          onTap={toggle}
        />
      )}
      <div className="lp-row">
        <PillGauge gauge={state.gauge} isFill />
        <CancelButton onExit={actions.onExit} />
        <SubmitButton state={state} onSubmit={actions.onSubmit} />
      </div>
      {/* La palette complète dépliée remplace toute la rangée : elle revient quand la palette se replie. */}
      {!isOpen && (
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
      {/* Les outils se répartissent sur toute la largeur par des ressorts : Vider y prend sa part en s'ouvrant (reveal.css). */}
      <div className="lp-row">
        <Button
          icon={Eraser}
          variant="ghost"
          title="Gomme"
          isPressed={isEraser}
          onPress={actions.onToggleEraser}
        />
        <span className="lp-spacer" />
        <PickerButton state={state} actions={actions} />
        <span className="lp-spacer" />
        <TraceButton state={state} actions={actions} />
        <DiscardButton state={state} isSpread onDiscard={actions.onDiscard} />
      </div>
      {/* Un clic, Entrée, Espace ou Échap replient la feuille (design system, Mobile) ; une flèche choisit sans la replier. Le panneau reste ouvert. */}
      {isOpen && (
        <Palette
          palette={state.palette}
          colorIndex={state.colorIndex}
          onPick={actions.onPickColor}
          onDone={() => setIsExpanded(false)}
          isTouch
          hasEraser={false}
        />
      )}
      <Refusal code={state.refusal} />
    </>
  );
};

// Un seul bouton, qui dit tout. Empilée : au téléphone, la barre prend toute la largeur, et le bouton aussi.
const guestContent = (signInHref: string, onSignIn: () => void): DraftPillContent => ({
  layout: "stack",
  content: (
    <div className="lp-invitation">
      <SignInButton href={signInHref} label="Se connecter pour dessiner" onPress={onSignIn} />
      <SignInNote />
    </div>
  ),
});

const draftContent = (
  state: DraftModeState,
  actions: DraftPillActions,
  isCompact: boolean,
  isSidePanel: boolean,
): DraftPillContent => ({
  layout: "stack",
  pillState: state.isSending ? { kind: "locked" } : undefined,
  content: isCompact ? (
    <DraftSheet state={state} actions={actions} isPanel={isSidePanel} />
  ) : (
    <>
      <Palette palette={state.palette} colorIndex={state.colorIndex} onPick={actions.onPickColor} />
      <div className="lp-row">
        <PillGauge gauge={state.gauge} />
        <span className="lp-spacer" />
        {state.isTouchScreen && <TraceButton state={state} actions={actions} />}
        <PickerButton state={state} actions={actions} />
        <DiscardButton state={state} onDiscard={actions.onDiscard} />
        <CancelButton onExit={actions.onExit} />
        <SubmitButton state={state} onSubmit={actions.onSubmit} />
      </div>
      <Refusal code={state.refusal} />
    </>
  ),
});

const contentOf = (
  state: DraftPillState,
  actions: DraftPillActions,
  isCompact: boolean,
  isSidePanel: boolean,
): DraftPillContent => {
  switch (state.kind) {
    case "connecting":
      return {
        content: <EnterButton onEnter={actions.onEnter} />,
        pillState: { kind: "reconnecting", label: "Connexion" },
      };
    case "reconnecting":
      return {
        ...contentOf(state.shown, actions, isCompact, isSidePanel),
        pillState: { kind: "reconnecting", label: "Reconnexion" },
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
    case "banned":
      return { content: <span className="lp-type-body lp-prompt">Tu es banni·e de ce canvas</span> };
    case "guest":
      return guestContent(state.signInHref, actions.onSignIn);
    case "signingIn":
      return {
        ...guestContent(state.signInHref, actions.onSignIn),
        pillState: { kind: "reconnecting", label: "Connexion à Twitch" },
      };
    case "view":
      return {
        content: (
          <>
            <PillGauge gauge={state.gauge} isFill={isCompact} />
            {state.canClaim ? (
              <BubbleTarget name="claim">
                <ClaimButton onClaim={actions.onClaim} />
              </BubbleTarget>
            ) : (
              <EnterButton onEnter={actions.onEnter} />
            )}
            <Refusal code={state.refusal} />
          </>
        ),
      };
    case "draft":
      return draftContent(state, actions, isCompact, isSidePanel);
  }
};

export const DraftPill = ({
  state,
  actions,
  isCompact = false,
  isSidePanel = false,
  isDocked = true,
}: DraftPillProps) => {
  const { content, layout, pillState } = contentOf(state, actions, isCompact, isSidePanel);
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout={layout} state={pillState}>
      {content}
    </Pill>
  );
};

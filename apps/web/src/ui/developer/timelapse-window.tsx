// La fenêtre du GIF timelapse (JOURNAL 2026-11-11) : la génération, l'aperçu avec Télécharger, ou l'erreur. En français comme toute
// la fenêtre Développeur, quelle que soit la langue de la page. Des lignes simples, sans cartes.

import { Clapperboard } from "lucide-react";
import { Button } from "../design/button";
import { ProgressBar } from "../design/progress-bar";
import { Window, WindowRow, type WindowSection } from "../design/window";
import { FixedLocale } from "../locale/use-locale";
import type { TimelapseState } from "./timelapse-run";
import { TIMELAPSE_TEXTS } from "./timelapse-summary";
import type { Timelapse } from "./use-timelapse";

const doNothing = (): void => undefined;

// Une seule section : la fenêtre n'a pas d'onglets à changer.
const SECTIONS = [
  { id: "gif", label: TIMELAPSE_TEXTS.title, icon: Clapperboard },
] as const satisfies readonly WindowSection<"gif">[];

const Progress = ({ line, value, max }: { line: string; value?: number; max?: number }) => (
  <>
    <ProgressBar
      label={line}
      {...(value === undefined ? {} : { value })}
      {...(max === undefined ? {} : { max })}
    />
    <p className="lp-type-body lp-muted" role="status">
      {line}
    </p>
  </>
);

type BodyProps = { state: TimelapseState; onRetry: () => void };

export const TimelapseBody = ({ state, onRetry }: BodyProps) => {
  if (state.kind === "reading") return <Progress line={TIMELAPSE_TEXTS.reading} />;
  if (state.kind === "drawing")
    return (
      <Progress
        line={TIMELAPSE_TEXTS.drawing(state.done, state.total)}
        value={state.done}
        max={state.total}
      />
    );
  if (state.kind === "failed")
    return (
      <WindowRow label={TIMELAPSE_TEXTS.failures[state.reason]} isFailed>
        {state.reason === "failed" && <Button label={TIMELAPSE_TEXTS.retry} onPress={onRetry} />}
      </WindowRow>
    );
  return (
    <>
      <img className="lp-timelapse-preview" src={state.url} alt={TIMELAPSE_TEXTS.preview} />
      <WindowRow label={state.summary}>
        <Button
          label={TIMELAPSE_TEXTS.download}
          variant="primary"
          href={state.url}
          download={state.fileName}
        />
      </WindowRow>
    </>
  );
};

type TimelapseWindowProps = BodyProps & { isOpen: boolean; onClose: () => void };

export const TimelapseWindow = ({ isOpen, onClose, ...body }: TimelapseWindowProps) => (
  <FixedLocale locale="fr">
    <Window
      isOpen={isOpen}
      sections={SECTIONS}
      sectionId="gif"
      onSelect={doNothing}
      onClose={onClose}
      isLarge
    >
      <div className="lp-timelapse">
        <TimelapseBody {...body} />
      </div>
    </Window>
  </FixedLocale>
);

// Rien tant que le bouton n'est pas là : la fenêtre n'existe que pour le développeur.
export const TimelapseWindowFor = ({ timelapse }: { timelapse: Timelapse }) =>
  timelapse.onOpen ? <TimelapseWindow {...timelapse.window} /> : null;

// Le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08), dans une bulle : deux gestes à connaître, et trois points,
// un par geste distinct réussi. L'affichage seul, nourri par `useFirstHintProps`.

import { Minimize2, Pointer } from "lucide-react";
import { useState } from "react";
import { HINT_STEPS } from "../../state/first-hint";
import { Bubble, BubbleLine } from "../design/bubble";
import { classNames } from "../design/class-names";
import { useTexts } from "../locale/use-locale";
import { HINT_TEXTS } from "./hint-texts";

export type FirstHintProps = {
  doneCount: number; // 0 à 3 : les points remplis
  isVisible: boolean;
  isDocked?: boolean;
};

const HINT_LINES = [
  { icon: Minimize2, key: "pinch" },
  { icon: Pointer, key: "tapPixel" },
] as const;

const HintDots = ({ count }: { count: number }) => {
  const t = useTexts(HINT_TEXTS);
  return (
    <span className="lp-hint-dots" role="img" aria-label={t.progress(count, HINT_STEPS.length)}>
      {HINT_STEPS.map((step, index) => (
        <span key={step} className={classNames("lp-hint-dot", index < count && "is-filled")} />
      ))}
    </span>
  );
};

export const FirstHint = ({ doneCount, isVisible, isDocked = true }: FirstHintProps) => {
  // Un point gagné pendant que la bulle est cachée (la feuille d'inspection) se remplit à son retour, sous les yeux.
  const t = useTexts(HINT_TEXTS);
  const [shownCount, setShownCount] = useState(doneCount);
  if (isVisible && shownCount !== doneCount) setShownCount(doneCount);
  return (
    <Bubble isVisible={isVisible} isDocked={isDocked}>
      {HINT_LINES.map(({ icon, key }) => (
        <BubbleLine key={key} icon={icon}>
          {t[key]}
        </BubbleLine>
      ))}
      <HintDots count={shownCount} />
    </Bubble>
  );
};

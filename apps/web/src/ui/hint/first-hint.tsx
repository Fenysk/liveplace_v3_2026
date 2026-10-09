// Le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08), dans une bulle : deux gestes à connaître, et trois points,
// un par geste distinct réussi. L'affichage seul, nourri par `useFirstHintProps`.

import { Minimize2, Pointer } from "lucide-react";
import { useState } from "react";
import { HINT_STEPS } from "../../state/first-hint";
import { Bubble, BubbleLine } from "../design/bubble";
import { classNames } from "../design/class-names";

export type FirstHintProps = {
  doneCount: number; // 0 à 3 : les points remplis
  isVisible: boolean;
  isDocked?: boolean;
};

const HINT_LINES = [
  { icon: Minimize2, text: "Pince pour zoomer" },
  { icon: Pointer, text: "Touche un pixel pour voir qui l'a posé" },
] as const;

const HintDots = ({ count }: { count: number }) => (
  <span className="lp-hint-dots" role="img" aria-label={`${count} sur ${HINT_STEPS.length}`}>
    {HINT_STEPS.map((step, index) => (
      <span key={step} className={classNames("lp-hint-dot", index < count && "is-filled")} />
    ))}
  </span>
);

export const FirstHint = ({ doneCount, isVisible, isDocked = true }: FirstHintProps) => {
  // Un point gagné pendant que la bulle est cachée (la feuille d'inspection) se remplit à son retour, sous les yeux.
  const [shownCount, setShownCount] = useState(doneCount);
  if (isVisible && shownCount !== doneCount) setShownCount(doneCount);
  return (
    <Bubble isVisible={isVisible} isDocked={isDocked}>
      {HINT_LINES.map(({ icon, text }) => (
        <BubbleLine key={text} icon={icon}>
          {text}
        </BubbleLine>
      ))}
      <HintDots count={shownCount} />
    </Bubble>
  );
};

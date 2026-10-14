// L'échec d'une action sur une ligne de l'onglet Modération (Écart §8.1, JOURNAL 2026-10-13) : la liste reste, la ligne le
// dit et propose de relancer la même action. L'alerte est toujours là, vide tant que rien n'a échoué (connection-lost.tsx).

import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { useTexts } from "../locale/use-locale";
import { ConnectionLost } from "./connection-lost";
import { MODERATION_TEXTS } from "./moderation-texts";

type RowFailureProps = { isFailed: boolean; onRetry: () => void };

export const RowFailure = ({ isFailed, onRetry }: RowFailureProps) => {
  const t = useTexts(MODERATION_TEXTS);
  return (
    <div className={classNames("lp-row-failure", isFailed && "lp-row-failure--failed")}>
      <ConnectionLost isFailed={isFailed} />
      {isFailed && <Button label={t.retry} onPress={onRetry} />}
    </div>
  );
};

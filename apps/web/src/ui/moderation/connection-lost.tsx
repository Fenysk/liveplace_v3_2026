// L'échec qui demande de réessayer (fenêtre de confirmation, listes de l'onglet Modération) : une alerte toujours présente,
// vide tant que rien n'a échoué, car un texte ajouté dans une alerte déjà là est lu, une alerte née avec son texte non.

import { classNames } from "../design/class-names";
import { CONNECTION_LOST } from "./moderation-texts";

type ConnectionLostProps = { isFailed: boolean; className?: string };

export const ConnectionLost = ({ isFailed, className }: ConnectionLostProps) => (
  <span
    role="alert"
    className={classNames("lp-type-caption lp-danger", className, !isFailed && "lp-visually-hidden")}
  >
    {isFailed ? CONNECTION_LOST : null}
  </span>
);

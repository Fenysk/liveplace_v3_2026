// La confirmation de la suppression du compte (CDC §8) : une petite fenêtre sur le modèle de Bannir, la seule confirmation, sans motif
// demandé. Elle dit ce qui part (la fresque, les archives et la vue OBS pour tout compte : chacun a une fresque dès sa première
// connexion, et la suppression l'efface toujours, JOURNAL 2026-11-02), ce qui reste, et ce que LivePlace ne peut pas effacer. Pendant l'effacement elle se verrouille et son
// bouton attend ; un échec avant l'inscription la garde ouverte, et le compte reste. L'affichage seul, nourri par `useAccountDeletion`.

import type { AccountDeletionView } from "../../state/account-deletion";
import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { DESIGN_TEXTS } from "../design/design-texts";
import { SmallWindow } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { DELETE_ACCOUNT_TEXTS } from "./delete-account-texts";

// La page où l'on retire LivePlace de son compte Twitch : LivePlace ne peut pas le faire pour lui.
export const TWITCH_CONNECTIONS_URL = "https://www.twitch.tv/settings/connections";

export type DeleteAccountWindowProps = AccountDeletionView & {
  onConfirm: () => void;
  onClose: () => void;
};

export const DeleteAccountWindow = ({
  isOpen,
  status,
  failure,
  onConfirm,
  onClose,
}: DeleteAccountWindowProps) => {
  const t = useTexts(DELETE_ACCOUNT_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const isRunning = status === "running";
  const failureText = status === "failed" ? (failure === "unauthenticated" ? t.signedOut : t.failed) : null;
  return (
    <SmallWindow
      isOpen={isOpen}
      title={t.title}
      onClose={onClose}
      isLocked={isRunning}
      actions={
        <>
          <Button label={design.cancel} kbd={design.escapeKey} onPress={onClose} />
          <Button
            label={isRunning ? t.deleting : t.deleteAccount}
            variant="danger"
            isDisabled={isRunning}
            hasMorphingLabel
            onPress={onConfirm}
          />
        </>
      }
    >
      <p className="lp-type-title lp-window-text">{t.immediate}</p>
      <div className="lp-window-block">
        <p className="lp-type-body lp-muted lp-window-text">{t.whatGoes}</p>
        <ul className="lp-type-body lp-window-list">
          <li>{t.goesCanvas}</li>
          <li>{t.goesBadges}</li>
          <li>{t.goesModerator}</li>
        </ul>
      </div>
      <p className="lp-type-body lp-window-text">
        <span className="lp-muted">{t.whatStays}</span> {t.staysPixels}
      </p>
      <p className="lp-type-body lp-window-text">
        <span className="lp-muted">{t.cannotErase}</span> {t.twitchAccess}{" "}
        <a className="lp-window-link" href={TWITCH_CONNECTIONS_URL} target="_blank" rel="noopener noreferrer">
          {t.twitchConnections}
        </a>
        .
      </p>
      {/* Une alerte toujours là, vide jusqu'à l'échec : un texte ajouté dans une alerte déjà présente est lu, une alerte née avec son texte non. */}
      <p
        role="alert"
        className={classNames(
          "lp-type-caption lp-danger lp-window-text",
          !failureText && "lp-visually-hidden",
        )}
      >
        {failureText}
      </p>
    </SmallWindow>
  );
};

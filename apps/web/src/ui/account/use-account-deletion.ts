// Ce que montre la suppression du compte (CDC §8) : la fenêtre de confirmation, que la page porte à côté de la fenêtre de Mon compte
// (comme la confirmation de Bannir), et le geste qui l'ouvre. Pendant l'effacement la socket se ferme (code 4001) et la page redevient
// celle d'un invité : la fenêtre n'en dépend pas, elle reste jusqu'au retour à l'accueil.

import { useState, useSyncExternalStore } from "react";
import { createAccountDeletionStore } from "../../state/account-deletion";
import { forgetDevice, rememberAccountDeleted } from "./account-deleted";
import { requestAccountDeletion } from "./delete-account-request";
import type { DeleteAccountWindowProps } from "./delete-account-window";

// Le retour à l'accueil, déconnecté : l'appareil oublie la personne avant de partir, et laisse le mot que l'accueil lira.
const leaveForHome = (): void => {
  forgetDevice(() => window.localStorage);
  rememberAccountDeleted(() => window.sessionStorage);
  window.location.assign("/");
};

export type AccountDeletion = {
  onOpen: () => void;
  // L'effacement est lancé : ce que la page signale de la socket qui se ferme (connexion perdue) n'a plus lieu d'être.
  isRunning: boolean;
  window: DeleteAccountWindowProps;
};

export function useAccountDeletion(): AccountDeletion {
  const [store] = useState(() =>
    createAccountDeletionStore({ request: () => requestAccountDeletion(), leave: leaveForHome }),
  );
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  return {
    onOpen: store.open,
    isRunning: view.status === "running",
    window: { ...view, onConfirm: () => void store.confirm(), onClose: store.close },
  };
}

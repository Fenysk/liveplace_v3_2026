// CDC §8, Supprimer son compte : l'état de la fenêtre de confirmation, de l'ouverture à l'effacement. Rien n'est demandé au serveur
// avant la confirmation ; une fois lancé, un second clic ne relance rien et la fenêtre ne se ferme pas. L'effacement réussi ne se
// défait pas : la page quitte les lieux (`leave`), la fenêtre reste verrouillée jusque-là.

import type { Result } from "@liveplace/shared";

// Les raisons que le web donne, dans `POST /auth/delete-account` : pas de session, une erreur avant l'inscription de l'effacement
// (le compte reste), une requête qui ne vient pas de notre page.
export const DELETE_ACCOUNT_REASONS = ["unauthenticated", "failed", "forbidden"] as const;
export type DeleteAccountReason = (typeof DELETE_ACCOUNT_REASONS)[number];

// `network` : la requête n'a pas abouti. Le serveur a pu finir sans que la page le sache : réessayer est sans risque, la routine
// est idempotente et une session déjà refusée le dit (`unauthenticated`).
export type DeleteAccountFailure = DeleteAccountReason | "network";

// `running` : verrouillée jusqu'à la réponse. `failed` : elle reste ouverte et le dit.
export type DeleteAccountStatus = "idle" | "running" | "failed";

export type AccountDeletionView = {
  isOpen: boolean;
  status: DeleteAccountStatus;
  failure: DeleteAccountFailure | null;
};

export type AccountDeletionDeps = {
  request: () => Promise<Result<void, DeleteAccountFailure>>;
  // L'appareil oublie la personne, l'accueil dira « Compte supprimé », la page repart de zéro.
  leave: () => void;
};

export type AccountDeletionStore = {
  subscribe(listener: () => void): () => void;
  getView(): AccountDeletionView;
  open(): void;
  close(): void;
  confirm(): Promise<void>;
};

const CLOSED: AccountDeletionView = { isOpen: false, status: "idle", failure: null };

export function createAccountDeletionStore({ request, leave }: AccountDeletionDeps): AccountDeletionStore {
  let view = CLOSED;
  const listeners = new Set<() => void>();
  const publish = (next: AccountDeletionView): void => {
    view = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,

    open: () => {
      if (!view.isOpen) publish({ isOpen: true, status: "idle", failure: null });
    },

    // Pendant l'effacement, rien ne ferme la fenêtre : ni Échap, ni Annuler, ni la poignée.
    close: () => {
      if (view.isOpen && view.status !== "running") publish(CLOSED);
    },

    async confirm() {
      if (!view.isOpen || view.status === "running") return;
      publish({ isOpen: true, status: "running", failure: null });
      const result = await request();
      if (!result.ok) return publish({ isOpen: true, status: "failed", failure: result.error });
      leave();
    },
  };
}

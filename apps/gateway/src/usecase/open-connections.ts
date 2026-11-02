// CDC §8, Supprimer son compte : les connexions ouvertes du gateway, pour fermer celles d'un compte supprimé, et celles
// des pages de ses fresques (JOURNAL 2026-11-01).

import type { ClientSocket } from "@liveplace/domain/ports";

// « Compte supprimé » : un code à nous, de la plage 4000-4999. La page se reconnecte, comme après toute coupure, et la
// session refusée ou la fresque disparue lui répondent.
export const CLOSE_ACCOUNT_DELETED = 4001;

// `userId` : le compte de la session ; `ownerId` : le streamer du canvas que la page a joint, absent avant son `hello`.
export type OpenConnection = {
  userId: string | undefined;
  ownerId: string | undefined;
  socket: Pick<ClientSocket, "close">;
};

export interface OpenConnections {
  add(connection: OpenConnection): () => void; // rend de quoi la retirer à sa fermeture
  closeAccount(userId: string): number; // combien de connexions fermées
}

export function createOpenConnections(): OpenConnections {
  const connections = new Set<OpenConnection>();
  return {
    add(connection) {
      connections.add(connection);
      return () => {
        connections.delete(connection);
      };
    },

    closeAccount(userId) {
      let closed = 0;
      for (const { userId: sessionUserId, ownerId, socket } of connections)
        if (sessionUserId === userId || ownerId === userId) {
          socket.close(CLOSE_ACCOUNT_DELETED);
          closed += 1;
        }
      return closed;
    },
  };
}

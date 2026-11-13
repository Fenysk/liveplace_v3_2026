// §10.4 : le live Twitch des comptes. Le web garde l'état de chacun et confie
// ses changements au gateway (§2) ; il ne touche à aucun pixel.

import { MINUTE_MS, type Timestamp } from "@liveplace/domain";
import type {
  AccountList,
  TwitchEventSub,
  TwitchLive,
  TwitchLiveEvent,
  TwitchLiveSource,
  TwitchLiveState,
  TwitchLiveStore,
} from "@liveplace/domain/ports";

// Au-delà, l'état d'un streamer dont on rend la page est revérifié chez Twitch : un live resté allumé s'éteint.
const STALE_AFTER_MS = 5 * MINUTE_MS;

// JOURNAL 2026-11-12 : un live qui s'éteint note son heure de fin, que le dessin seulement pendant le live compte à partir de là ; hors
// live, une revérification la garde ; en live, elle n'a pas lieu d'être.
const endedAtOf = (
  previous: TwitchLiveState | null,
  isLive: boolean,
  at: Timestamp,
): Timestamp | undefined => {
  if (isLive) return undefined;
  return previous?.twitchLive ? at : previous?.endedAt;
};

export type TwitchLiveDeps = {
  source: TwitchLiveSource;
  eventSub: Pick<TwitchEventSub, "subscribeToLive" | "deleteSubscriptions">;
  // CDC §8 : un compte supprimé n'est plus suivi (JOURNAL 2026-11-02).
  accounts: Pick<AccountList, "isDeletedAccount">;
  store: TwitchLiveStore;
  now: () => Timestamp;
};

export type TwitchLiveTracker = {
  // Ce que Twitch vient de dire du live d'une chaîne.
  apply(event: TwitchLiveEvent): Promise<void>;
  // À la connexion : s'abonner et prendre l'état de départ, en arrière-plan. Ne rejette jamais.
  track(userId: string): void;
  // Pour le rendu d'une page : l'état connu, sans jamais attendre Twitch.
  getLive(userId: string): Promise<TwitchLive | undefined>;
};

export function createTwitchLiveTracker({
  source,
  eventSub,
  accounts,
  store,
  now,
}: TwitchLiveDeps): TwitchLiveTracker {
  const checking = new Set<string>(); // les comptes dont Twitch est déjà interrogé : un rendu de plus n'en refait pas un appel

  // Note le live d'un compte ; le gateway n'est prévenu que si ce qu'on voit à l'écran change. Un compte supprimé ne reçoit ni
  // l'un ni l'autre : le magasin les refuse d'un seul bloc.
  const settle = async (userId: string, previous: TwitchLiveState | null, twitchLive?: TwitchLive) => {
    const hasChanged = previous?.twitchLive?.category !== twitchLive?.category;
    const checkedAt = now();
    const endedAt = endedAtOf(previous, twitchLive !== undefined, checkedAt);
    await store.setTwitchLiveState(
      userId,
      { ...(twitchLive ? { twitchLive } : {}), checkedAt, ...(endedAt === undefined ? {} : { endedAt }) },
      hasChanged ? { kind: "twitchLive", userId, ...(twitchLive ? { twitchLive } : {}) } : undefined,
    );
  };

  // L'événement `stream.online` ne porte pas la catégorie : sans elle, le live reste un live.
  const getCategory = async (userId: string): Promise<string> => {
    try {
      return await source.getCategory(userId);
    } catch (error) {
      console.error("twitch live : catégorie illisible", error);
      return "";
    }
  };

  const reconcile = async (userId: string): Promise<void> => {
    if (checking.has(userId)) return;
    checking.add(userId);
    try {
      const twitchLive = await source.getLive(userId);
      await settle(userId, await store.getTwitchLiveState(userId), twitchLive ?? undefined);
    } finally {
      checking.delete(userId);
    }
  };

  // Hors du chemin de la connexion ou du rendu : un échec est journalisé sans le compte, il ne remonte jamais.
  const inBackground = (what: string, work: () => Promise<void>): void => {
    work().catch((error: unknown) => console.error(`twitch live : ${what} en échec`, error));
  };

  // S'abonner, sauf pour un compte supprimé. L'effacement a pu passer pendant l'appel à Twitch : ce qui vient d'être créé pour
  // lui est alors retiré, car l'effacement, lui, avait déjà fini de retirer les siens.
  const subscribe = async (userId: string): Promise<void> => {
    if (await accounts.isDeletedAccount(userId)) return;
    await eventSub.subscribeToLive(userId);
    if (await accounts.isDeletedAccount(userId)) await eventSub.deleteSubscriptions(userId);
  };

  const track = (userId: string): void => {
    inBackground("abonnement", () => subscribe(userId));
    inBackground("état de départ", () => reconcile(userId));
  };

  return {
    async apply(event) {
      const userId = event.broadcasterId;
      const previous = await store.getTwitchLiveState(userId);
      switch (event.kind) {
        case "online":
          return settle(userId, previous, { category: await getCategory(userId) });
        case "category":
          // Hors live, une catégorie n'allume rien.
          if (previous?.twitchLive) await settle(userId, previous, { category: event.category });
          return;
        case "offline":
        case "liveRevoked":
          return settle(userId, previous);
      }
    },

    track,

    async getLive(userId) {
      let state: TwitchLiveState | null;
      try {
        state = await store.getTwitchLiveState(userId);
      } catch (error) {
        console.error("twitch live : état illisible", error);
        return undefined;
      }
      if (!state)
        track(userId); // la première visite de ce canvas : abonner son streamer
      else if (now() - state.checkedAt > STALE_AFTER_MS)
        inBackground("vérification", () => reconcile(userId));
      return state?.twitchLive;
    },
  };
}

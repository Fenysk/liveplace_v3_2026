// Écart §4 et §10.1 (JOURNAL 2026-10-07) : le live Twitch des comptes. Le web garde l'état de chacun et confie
// ses changements au gateway (§2) ; il ne touche à aucun pixel.

import { MINUTE_MS, type Timestamp } from "@liveplace/domain";
import type {
  TwitchEventSub,
  TwitchLive,
  TwitchLiveEvent,
  TwitchLiveSource,
  TwitchLiveState,
  TwitchLiveStore,
  TwitchWrites,
} from "@liveplace/domain/ports";

// Au-delà, l'état d'un streamer dont on rend la page est revérifié chez Twitch : un live resté allumé s'éteint.
const STALE_AFTER_MS = 5 * MINUTE_MS;

export type TwitchLiveDeps = {
  source: TwitchLiveSource;
  eventSub: Pick<TwitchEventSub, "subscribeToLive">;
  store: TwitchLiveStore;
  commands: Pick<TwitchWrites, "queueTwitchCommands">;
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
  store,
  commands,
  now,
}: TwitchLiveDeps): TwitchLiveTracker {
  const checking = new Set<string>(); // les comptes dont Twitch est déjà interrogé : un rendu de plus n'en refait pas un appel

  // Note le live d'un compte ; le gateway n'est prévenu que si ce qu'on voit à l'écran change.
  const settle = async (userId: string, previous: TwitchLiveState | null, twitchLive?: TwitchLive) => {
    await store.setTwitchLiveState(userId, { ...(twitchLive ? { twitchLive } : {}), checkedAt: now() });
    if (previous?.twitchLive?.category === twitchLive?.category) return;
    await commands.queueTwitchCommands([
      { kind: "twitchLive", userId, ...(twitchLive ? { twitchLive } : {}) },
    ]);
  };

  // L'événement `stream.online` ne porte pas la catégorie : sans elle, le live reste un live.
  const getCategory = async (userId: string): Promise<string> => {
    try {
      return await source.getCategory(userId);
    } catch (error) {
      console.error(`twitch live : catégorie de ${userId} illisible`, error);
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

  // Hors du chemin de la connexion ou du rendu : un échec est journalisé, il ne remonte jamais.
  const inBackground = (what: string, userId: string, work: () => Promise<void>): void => {
    work().catch((error: unknown) => console.error(`twitch live : ${what} de ${userId} en échec`, error));
  };

  const track = (userId: string): void => {
    inBackground("abonnement", userId, () => eventSub.subscribeToLive(userId));
    inBackground("état de départ", userId, () => reconcile(userId));
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
        console.error(`twitch live : état de ${userId} illisible`, error);
        return undefined;
      }
      if (!state)
        track(userId); // la première visite de ce canvas : abonner son streamer
      else if (now() - state.checkedAt > STALE_AFTER_MS)
        inBackground("vérification", userId, () => reconcile(userId));
      return state?.twitchLive;
    },
  };
}

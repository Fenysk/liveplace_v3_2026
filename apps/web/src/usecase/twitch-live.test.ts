import type { TwitchCommand, TwitchLive, TwitchLiveEvent, TwitchLiveState } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwitchLiveTracker } from "./twitch-live";

const now = 1_700_000_000_000;
const MINUTE = 60_000;
const userId = "1234";
const art: TwitchLive = { category: "Art" };

// Laisse finir ce qui part en arrière-plan : les doubles répondent tous sur-le-champ.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type SetupOptions = {
  state?: TwitchLiveState; // ce que Redis garde déjà ; absent : aucun état connu
  streaming?: TwitchLive | null; // ce que dit helix/streams
  category?: string; // ce que dit helix/channels
  isSourceDown?: boolean; // Twitch ne répond pas
  isSubscriptionFailing?: boolean;
  isSourceHanging?: boolean; // Twitch ne répond jamais
  isStoreDown?: boolean; // Redis ne répond pas
};

// Des doubles qui notent leurs appels : l'état est gardé en mémoire, les actions du gateway sont listées.
const setup = (options: SetupOptions = {}) => {
  const states = new Map<string, TwitchLiveState>(options.state ? [[userId, options.state]] : []);
  const commands: TwitchCommand[] = [];
  const subscribed: string[] = [];
  const asked: string[] = [];
  const deps = {
    source: {
      async getLive(asking: string) {
        asked.push(`streams ${asking}`);
        if (options.isSourceHanging) return new Promise<never>(() => undefined);
        if (options.isSourceDown) throw new Error("Twitch ne répond pas");
        return options.streaming ?? null;
      },
      async getCategory(asking: string) {
        asked.push(`channels ${asking}`);
        if (options.isSourceDown) throw new Error("Twitch ne répond pas");
        return options.category ?? "";
      },
    },
    eventSub: {
      async subscribeToLive(broadcasterId: string) {
        subscribed.push(broadcasterId);
        if (options.isSubscriptionFailing) throw new Error("abonnement refusé");
      },
    },
    store: {
      async getTwitchLiveState(asking: string) {
        if (options.isStoreDown) throw new Error("Redis ne répond pas");
        return states.get(asking) ?? null;
      },
      async setTwitchLiveState(asking: string, state: TwitchLiveState) {
        states.set(asking, state);
      },
    },
    commands: {
      async queueTwitchCommands(queued: readonly TwitchCommand[]) {
        commands.push(...queued);
      },
    },
    now: () => now,
  };
  return { tracker: createTwitchLiveTracker(deps), states, commands, subscribed, asked };
};

const online: TwitchLiveEvent = { kind: "online", broadcasterId: userId };
const offline: TwitchLiveEvent = { kind: "offline", broadcasterId: userId };
const live = (category: string): TwitchLiveState => ({ twitchLive: { category }, checkedAt: now - MINUTE });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the live of a channel, told by Twitch (Écart §4, JOURNAL 2026-10-07)", () => {
  // Quand une chaîne passe en live, l'état prend la catégorie de la chaîne et le gateway est prévenu
  it("keeps the channel's category when it goes live, and has the gateway told", async () => {
    const { tracker, states, commands, asked } = setup({ category: "Art" });

    await tracker.apply(online);

    expect(asked).toEqual(["channels 1234"]);
    expect(states.get(userId)).toEqual({ twitchLive: art, checkedAt: now });
    expect(commands).toEqual([{ kind: "twitchLive", userId, twitchLive: art }]);
  });

  // Si Twitch ne dit pas la catégorie, le live est quand même noté, sans catégorie, et l'échec est journalisé
  it("notes the live without a category when Twitch does not say it, and logs the failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tracker, states, commands } = setup({ isSourceDown: true });

    await tracker.apply(online);

    expect(states.get(userId)).toEqual({ twitchLive: { category: "" }, checkedAt: now });
    expect(commands).toEqual([{ kind: "twitchLive", userId, twitchLive: { category: "" } }]);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  // Quand le live finit, l'état est noté hors live et le gateway est prévenu, sans catégorie
  it("notes the end of a live and has the gateway told, without a category", async () => {
    const { tracker, states, commands } = setup({ state: live("Art") });

    await tracker.apply(offline);

    expect(states.get(userId)).toEqual({ checkedAt: now });
    expect(commands).toEqual([{ kind: "twitchLive", userId }]);
  });

  // Une révocation de l'abonnement de live efface le live comme sa fin
  it("clears the live when a live subscription is revoked", async () => {
    const { tracker, states, commands } = setup({ state: live("Art") });

    await tracker.apply({ kind: "liveRevoked", broadcasterId: userId });

    expect(states.get(userId)).toEqual({ checkedAt: now });
    expect(commands).toEqual([{ kind: "twitchLive", userId }]);
  });

  // Si rien ne change (déjà hors live, ou même catégorie), l'état est rafraîchi mais le gateway n'est pas dérangé
  it("refreshes the state but does not bother the gateway when nothing changes", async () => {
    const wasOffline = setup({ state: { checkedAt: now - MINUTE }, category: "Art" });
    const wasUnknown = setup();
    const wasSame = setup({ state: live("Art"), category: "Art" });

    await wasOffline.tracker.apply(offline);
    await wasUnknown.tracker.apply(offline);
    await wasSame.tracker.apply(online);

    expect(wasOffline.commands).toEqual([]);
    expect(wasUnknown.commands).toEqual([]);
    expect(wasSame.commands).toEqual([]);
    expect(wasSame.states.get(userId)).toEqual({ twitchLive: art, checkedAt: now });
  });

  // Quand la catégorie change pendant un live, le gateway est prévenu ; hors live, l'événement est ignoré
  it("tells a category change during a live, and ignores it when the channel is not live", async () => {
    const duringLive = setup({ state: live("Art") });
    const offLive = setup({ state: { checkedAt: now - MINUTE } });
    const unknown = setup();
    const event: TwitchLiveEvent = { kind: "category", broadcasterId: userId, category: "Just Chatting" };

    await duringLive.tracker.apply(event);
    await offLive.tracker.apply(event);
    await unknown.tracker.apply(event);

    expect(duringLive.states.get(userId)).toEqual({
      twitchLive: { category: "Just Chatting" },
      checkedAt: now,
    });
    expect(duringLive.commands).toEqual([
      { kind: "twitchLive", userId, twitchLive: { category: "Just Chatting" } },
    ]);
    expect(offLive.states.get(userId)).toEqual({ checkedAt: now - MINUTE });
    expect(offLive.commands).toEqual([]);
    expect(unknown.states.size).toBe(0);
    expect(unknown.commands).toEqual([]);
  });
});

describe("tracking an account at its sign-in (Écart §4 et §10.1, JOURNAL 2026-10-07)", () => {
  // À la connexion, le compte est abonné et son état de départ vient de helix/streams
  it("subscribes the account and takes its starting state from helix/streams, in the background", async () => {
    const { tracker, states, commands, subscribed, asked } = setup({ streaming: art });

    tracker.track(userId);
    await flush();

    expect(subscribed).toEqual([userId]);
    expect(asked).toEqual(["streams 1234"]);
    expect(states.get(userId)).toEqual({ twitchLive: art, checkedAt: now });
    expect(commands).toEqual([{ kind: "twitchLive", userId, twitchLive: art }]);
  });

  // Si l'abonnement échoue, l'état de départ est pris quand même ; si Twitch est muet, rien ne remonte à la connexion
  it("takes the starting state even when the subscription fails, and never lets a failure out", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const subscriptionFails = setup({ streaming: art, isSubscriptionFailing: true });
    const twitchDown = setup({ isSourceDown: true });

    subscriptionFails.tracker.track(userId);
    twitchDown.tracker.track(userId);
    await flush();

    expect(subscriptionFails.states.get(userId)).toEqual({ twitchLive: art, checkedAt: now });
    expect(twitchDown.states.size).toBe(0);
    expect(logged).toHaveBeenCalledTimes(2);
  });

  // Le `track` rend la main aussitôt : il n'attend pas un Twitch qui ne répond pas
  it("hands control back at once, even when Twitch never answers", () => {
    const { tracker } = setup({ isSourceHanging: true });

    expect(tracker.track(userId)).toBeUndefined();
  });
});

describe("reading the live of an owner when its page is rendered (Écart §4, JOURNAL 2026-10-07)", () => {
  // Un état récent est rendu tel quel, sans un seul appel à Twitch
  it("gives a recent state as it is, without a single call to Twitch", async () => {
    const { tracker, asked, subscribed } = setup({ state: live("Art") });

    expect(await tracker.getLive(userId)).toEqual(art);
    await flush();

    expect(asked).toEqual([]);
    expect(subscribed).toEqual([]);
  });

  // Après 5 minutes, l'état connu est rendu tout de suite et revérifié en arrière-plan : un live resté allumé s'éteint
  it("gives an older state at once and checks it again in the background: a stuck live goes out", async () => {
    const { tracker, states, commands, asked, subscribed } = setup({
      state: { twitchLive: art, checkedAt: now - 5 * MINUTE - 1 },
      streaming: null,
    });

    expect(await tracker.getLive(userId)).toEqual(art);
    await flush();

    expect(asked).toEqual(["streams 1234"]);
    expect(subscribed).toEqual([]);
    expect(states.get(userId)).toEqual({ checkedAt: now });
    expect(commands).toEqual([{ kind: "twitchLive", userId }]);
  });

  // À 5 minutes pile, l'état est encore récent
  it("still takes a state of exactly 5 minutes as recent", async () => {
    const { tracker, asked } = setup({ state: { checkedAt: now - 5 * MINUTE } });

    await tracker.getLive(userId);
    await flush();

    expect(asked).toEqual([]);
  });

  // Sans aucun état connu : rien à montrer, et la première visite abonne le compte et prend son état
  it("shows nothing for an account with no known state, and subscribes it on that first visit", async () => {
    const { tracker, states, subscribed } = setup({ streaming: art });

    expect(await tracker.getLive(userId)).toBeUndefined();
    await flush();

    expect(subscribed).toEqual([userId]);
    expect(states.get(userId)).toEqual({ twitchLive: art, checkedAt: now });
  });

  // Quand Twitch est muet, la page est rendue quand même, et l'échec est journalisé
  it("renders the page all the same when Twitch is silent, and logs the failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tracker } = setup({
      state: { twitchLive: art, checkedAt: now - 10 * MINUTE },
      isSourceDown: true,
    });

    expect(await tracker.getLive(userId)).toEqual(art);
    await flush();

    expect(logged).toHaveBeenCalledTimes(1);
  });

  // Quand Redis est muet, la page est rendue hors live plutôt que cassée, et l'échec est journalisé
  it("renders the page not live rather than broken when Redis is silent, and logs the failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { tracker, asked } = setup({ isStoreDown: true });

    expect(await tracker.getLive(userId)).toBeUndefined();
    await flush();

    expect(asked).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  // La page n'attend jamais Twitch : même s'il ne répond pas, `getLive` rend l'état connu
  it("never waits for Twitch: it gives the known state even if Twitch never answers", async () => {
    const { tracker } = setup({
      state: { twitchLive: art, checkedAt: now - 10 * MINUTE },
      isSourceHanging: true,
    });

    expect(await tracker.getLive(userId)).toEqual(art);
  });

  // Plusieurs pages rendues pendant la même vérification ne font qu'un appel à Twitch
  it("makes a single call to Twitch for several renders during the same check", async () => {
    const { tracker, asked } = setup({
      state: { twitchLive: art, checkedAt: now - 10 * MINUTE },
      isSourceHanging: true,
    });

    await tracker.getLive(userId);
    await tracker.getLive(userId);
    await tracker.getLive(userId);
    await flush();

    expect(asked).toEqual(["streams 1234"]);
  });
});

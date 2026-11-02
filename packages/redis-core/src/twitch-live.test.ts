import { describe, expect, it } from "vitest";
import { toDeletedAccountKey } from "./deleted-accounts";
import { PENDING_DELETIONS_KEY, TWITCH_COMMANDS_KEY, twitchLiveKey } from "./keys";
import { createRedisHarness } from "./test-harness";
import { createAccountList, createTwitchLiveStore } from "./twitch-live";

const { redis, core, runId } = createRedisHarness();
const SECRET = "un-secret-de-session-de-plus-de-32-octets";
const store = createTwitchLiveStore(redis, SECRET);

describe("the Twitch live of an account (JOURNAL 2026-10-07)", () => {
  // Garde le live avec sa catégorie et l'heure de vérification, et les rend tels quels
  it("keeps the live with its category and the check time, and gives them back as they were", async () => {
    const userId = `${runId}-live`;

    await store.setTwitchLiveState(userId, { twitchLive: { category: "Art" }, checkedAt: 1234 });

    expect(await store.getTwitchLiveState(userId)).toEqual({
      twitchLive: { category: "Art" },
      checkedAt: 1234,
    });
    expect(await core.getTwitchLive(userId)).toEqual({ category: "Art" });
    expect(await redis.ttl(twitchLiveKey(userId))).toBe(-1);
  });

  // Un live sans catégorie reste un live : la catégorie vide ne le fait pas disparaître
  it("keeps a live without a category as a live", async () => {
    const userId = `${runId}-bare`;

    await store.setTwitchLiveState(userId, { twitchLive: { category: "" }, checkedAt: 1 });

    expect(await store.getTwitchLiveState(userId)).toEqual({ twitchLive: { category: "" }, checkedAt: 1 });
    expect(await core.getTwitchLive(userId)).toEqual({ category: "" });
  });

  // Hors live, l'état est connu mais sans live ; l'ancienne catégorie ne survit pas
  it("knows an account that is not live, and the previous category does not survive", async () => {
    const userId = `${runId}-offline`;
    await store.setTwitchLiveState(userId, { twitchLive: { category: "Art" }, checkedAt: 1 });

    await store.setTwitchLiveState(userId, { checkedAt: 2 });

    expect(await store.getTwitchLiveState(userId)).toEqual({ checkedAt: 2 });
    expect(await redis.hgetall(twitchLiveKey(userId))).toEqual({ checkedAt: "2" });
    expect(await core.getTwitchLive(userId)).toBeNull();
  });

  // Lit le live de plusieurs comptes d'un coup : seuls ceux en live ont une entrée, catégorie vide comprise
  it("lists the live of several accounts at once: only those live have an entry, an empty category included", async () => {
    const [art, bare, offline, unknown] = ["art", "bare", "off", "none"].map(
      (name) => `${runId}-list-${name}`,
    );
    await store.setTwitchLiveState(art ?? "", { twitchLive: { category: "Art" }, checkedAt: 1 });
    await store.setTwitchLiveState(bare ?? "", { twitchLive: { category: "" }, checkedAt: 1 });
    await store.setTwitchLiveState(offline ?? "", { checkedAt: 1 });

    const lives = await core.listTwitchLives([art ?? "", bare ?? "", offline ?? "", unknown ?? ""]);

    expect([...lives]).toEqual([
      [art, { category: "Art" }],
      [bare, { category: "" }],
    ]);
    expect(await core.listTwitchLives([])).toEqual(new Map());
  });

  // Liste les comptes connus par leur miroir `user:`, sans rien d'autre : ni clé de canvas, ni état de live
  it("lists the known accounts by their `user:` mirror, and nothing else", async () => {
    const [first, second] = [`${runId}-known-1`, `${runId}-known-2`];
    await core.setUser({ userId: first, login: "first", displayName: "First" });
    await core.setUser({ userId: second, login: "second", displayName: "Second" });
    await store.setTwitchLiveState(`${runId}-known-3`, { checkedAt: 1 });

    const listed = await createAccountList(redis, SECRET).listAccountIds();

    expect(listed).toContain(first);
    expect(listed).toContain(second);
    expect(listed).not.toContain(`${runId}-known-3`);
    expect(listed.filter((userId) => userId.startsWith("user:"))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  // Un compte jamais vu n'a aucun état : le web le reconnaît à `null` et s'en occupe, le gateway n'y voit pas de live
  it("has no state for an account never seen", async () => {
    const userId = `${runId}-unknown`;

    expect(await store.getTwitchLiveState(userId)).toBeNull();
    expect(await core.getTwitchLive(userId)).toBeNull();
  });
});

describe("the live of a deleted account (CDC §8, JOURNAL 2026-11-02)", () => {
  const accounts = createAccountList(redis, SECRET);
  const announce = (userId: string) =>
    ({ kind: "twitchLive", userId, twitchLive: { category: "Art" } }) as const;
  const commandsNaming = async (userId: string) =>
    (await redis.xrange(TWITCH_COMMANDS_KEY, "-", "+")).filter(([, fields]) =>
      fields.some((field) => field.includes(userId)),
    );
  const pending = (userId: string) =>
    redis.hset(PENDING_DELETIONS_KEY, userId, JSON.stringify({ runId: "r", trigger: "button" }));
  const fingerprint = (userId: string) => redis.set(toDeletedAccountKey(SECRET, userId), "1700000000000");

  // Un compte ordinaire : l'état et l'action du gateway partent ensemble, et le magasin dit que c'est écrit
  it("writes the state and the gateway action together for an ordinary account", async () => {
    const userId = `${runId}-ordinary`;

    const written = await store.setTwitchLiveState(
      userId,
      { twitchLive: { category: "Art" }, checkedAt: 5 },
      announce(userId),
    );

    expect(written).toBe(true);
    expect(await store.getTwitchLiveState(userId)).toEqual({ twitchLive: { category: "Art" }, checkedAt: 5 });
    const [entry] = await commandsNaming(userId);
    expect(JSON.parse(entry?.[1][1] ?? "{}")).toEqual(announce(userId));
    expect(await accounts.isDeletedAccount(userId)).toBe(false);
  });

  // Sans action à annoncer, rien n'entre dans la file
  it("queues no action when there is none to announce", async () => {
    const userId = `${runId}-quiet`;

    await store.setTwitchLiveState(userId, { checkedAt: 5 });

    expect(await commandsNaming(userId)).toEqual([]);
  });

  // Tant que l'effacement est en cours, ni l'état ni l'action ne sont écrits, et rien de l'ancien état ne revient
  it("writes neither the state nor the action while the deletion is in progress", async () => {
    const userId = `${runId}-pending`;
    await pending(userId);

    const written = await store.setTwitchLiveState(userId, { checkedAt: 5 }, announce(userId));

    expect(written).toBe(false);
    expect(await redis.exists(twitchLiveKey(userId))).toBe(0);
    expect(await commandsNaming(userId)).toEqual([]);
    expect(await accounts.isDeletedAccount(userId)).toBe(true);
    await redis.hdel(PENDING_DELETIONS_KEY, userId); // le hash est celui du serveur entier : rien d'autre ne le lit ici
  });

  // Une fois l'effacement fini, l'empreinte posée et le miroir parti : toujours rien d'écrit
  it("writes nothing once the deletion is over: the fingerprint is there and the mirror is gone", async () => {
    const userId = `${runId}-over`;
    await fingerprint(userId);

    const written = await store.setTwitchLiveState(userId, { checkedAt: 5 }, announce(userId));

    expect(written).toBe(false);
    expect(await redis.exists(twitchLiveKey(userId))).toBe(0);
    expect(await commandsNaming(userId)).toEqual([]);
    expect(await accounts.isDeletedAccount(userId)).toBe(true);
  });

  // Un compte qui se reconnecte pose un miroir neuf : l'empreinte, gardée 31 jours, ne le condamne pas
  it("writes again for an account that signed in again, whose fingerprint is still there", async () => {
    const userId = `${runId}-back`;
    await fingerprint(userId);
    await core.setUser({ userId, login: "back", displayName: "Back" });

    const written = await store.setTwitchLiveState(userId, { checkedAt: 5 }, announce(userId));

    expect(written).toBe(true);
    expect(await commandsNaming(userId)).toHaveLength(1);
    expect(await accounts.isDeletedAccount(userId)).toBe(false);
  });

  // L'empreinte d'un autre compte ne condamne pas celui-ci
  it("is not condemned by the fingerprint of another account", async () => {
    await fingerprint(`${runId}-someone`);

    expect(await store.setTwitchLiveState(`${runId}-another`, { checkedAt: 5 })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { twitchLiveKey } from "./keys";
import { createRedisHarness } from "./test-harness";
import { createAccountList, createTwitchLiveStore } from "./twitch-live";

const { redis, core, runId } = createRedisHarness();
const store = createTwitchLiveStore(redis);

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

    const listed = await createAccountList(redis).listAccountIds();

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

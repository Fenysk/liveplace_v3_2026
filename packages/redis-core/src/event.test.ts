import { randomUUID } from "node:crypto";
import { type CanvasMeta, defaultCanvasMeta, HOUR_MS, MINUTE_MS } from "@liveplace/domain";
import { CHARITY_READ_GRACE_MS, type CharityDonation } from "@liveplace/domain/charity-event";
import type { LiveMessage } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createAccountPurge } from "./account-purge";
import { createCharityDonationStore } from "./charity-store";
import { createEventCore } from "./event";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, core, runId } = harness;

const ADDRESS = "https://streamlabscharity.com/@grenneh_/dames-4-games-2026";
const TITLE = "Live caritatif";
const T0 = Date.UTC(2026, 10, 20, 12, 0);
const STARTS = T0 - HOUR_MS;
const ENDS = T0 + 5 * HOUR_MS;

const meta = (ownerId: string): CanvasMeta => ({
  ...defaultCanvasMeta(ownerId),
  width: 64,
  height: 64,
  gaugeMaxStart: 50,
  gaugeMaxCeiling: 60,
  refillMs: 1000,
});

// Une fresque, son streamer (n'importe lequel), et les deux ports du mode, sur un index qui n'est qu'à ce test.
const setup = async (ownerLogin = "grenneh_") => {
  const ownerId = `${runId}-owner-${randomUUID()}`;
  await core.setUser({ userId: ownerId, login: ownerLogin, displayName: ownerLogin });
  const { canvasId, keys } = await harness.readyCanvas(meta(ownerId));
  const charityKeys = harness.uniqueCharityKeys();
  const events = createEventCore(redis, charityKeys);
  const store = createCharityDonationStore(redis, charityKeys);
  const launch = (endsAt = ENDS, startsAt = STARTS) =>
    events.setCharityEvent(
      canvasId,
      { isEnabled: true, title: TITLE, address: ADDRESS, startsAt, endsAt },
      T0,
    );
  return { canvasId, keys, charityKeys, events, store, launch };
};

const donation = (id: string, cents: number, donatedAt: number, name = "Julie"): CharityDonation => ({
  id,
  name,
  cents,
  currency: "EUR",
  donatedAt,
});

const joinedUser = async (createdAt?: number) => {
  const userId = `${runId}-viewer-${randomUUID()}`;
  await core.setUser({ userId, login: "viewer", displayName: "Viewer" });
  if (createdAt !== undefined) await redis.hset(`user:${userId}`, "createdAt", createdAt);
  return userId;
};

describe("the activation (CDC 2026 §8, Mode événement)", () => {
  // Le mode existe sur la fresque de tout streamer, quel que soit son login
  it("exists on the canvas of any streamer", async () => {
    const { canvasId, events, charityKeys, launch } = await setup("astrena_");

    expect(await events.getCharityEvent(canvasId)).toEqual({});
    expect(await launch()).toMatchObject({ ok: true, value: { isEnabled: true, title: TITLE } });
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
  });

  // La fresque n'a aucun événement tant qu'il n'est pas réglé
  it("has no event on a canvas until one is set", async () => {
    const { canvasId, events } = await setup("Fenysk");

    expect(await events.getCharityEvent(canvasId)).toEqual({});
  });
});

describe("the setting of the event", () => {
  const setting = { isEnabled: true, title: TITLE, address: ADDRESS, startsAt: STARTS, endsAt: ENDS };

  // Le drapeau « dessin seulement pendant l'événement » s'écrit avec le réglage, se relit, et absent vaut faux
  it("keeps the event-only flag, and reads an absent one as false", async () => {
    const { canvasId, events, keys } = await setup();

    const without = await events.setCharityEvent(canvasId, setting, T0);
    const on = await events.setCharityEvent(canvasId, { ...setting, isEventOnly: true }, T0);
    const off = await events.setCharityEvent(canvasId, { ...setting, isEventOnly: false }, T0);
    await redis.hdel(keys.charityEvent, "isEventOnly");
    const legacy = await events.getCharityEvent(canvasId);

    expect(without.ok && "isEventOnly" in without.value).toBe(false);
    expect(on).toMatchObject({ ok: true, value: { isEventOnly: true } });
    expect(off.ok && "isEventOnly" in off.value).toBe(false);
    expect(legacy?.state && "isEventOnly" in legacy.state).toBe(false);
  });

  // Garde tout réglage tel quel, sans refus : une adresse, un titre ou des dates qui ne vont pas rendent l'événement inactif
  it("keeps any setting as it is, without refusing: a wrong one only leaves the event inactive", async () => {
    const { canvasId, events, charityKeys } = await setup();

    const wrongAddress = await events.setCharityEvent(
      canvasId,
      { ...setting, address: "https://example.com/@a/b" },
      T0,
    );
    const endBeforeStart = await events.setCharityEvent(canvasId, { ...setting, endsAt: STARTS }, T0);
    const endInThePast = await events.setCharityEvent(canvasId, { ...setting, endsAt: T0 - 1 }, T0);
    const noTitle = await events.setCharityEvent(canvasId, { ...setting, title: "  " }, T0);
    const noDates = await events.setCharityEvent(
      canvasId,
      { isEnabled: true, title: TITLE, address: "" },
      T0,
    );

    expect(wrongAddress).toMatchObject({ ok: true, value: { address: "https://example.com/@a/b" } });
    expect(endBeforeStart).toMatchObject({ ok: true, value: { startsAt: STARTS, endsAt: STARTS } });
    expect(endInThePast).toMatchObject({ ok: true, value: { endsAt: T0 - 1 } });
    expect(noTitle).toMatchObject({ ok: true, value: { title: "" } });
    expect(noDates).toMatchObject({ ok: true, value: { isEnabled: true, title: TITLE } });
    expect(noDates.ok && "startsAt" in noDates.value).toBe(false);
    expect(await redis.smembers(charityKeys.active)).toEqual([]);
  });

  // Un événement à venir se règle en entier, puis le début se change librement
  it("sets an upcoming event in full, and its start moves freely", async () => {
    const { canvasId, events, charityKeys } = await setup();
    const later = T0 + HOUR_MS;

    const set = await events.setCharityEvent(canvasId, { ...setting, startsAt: later }, T0);
    const edited = await events.setCharityEvent(canvasId, { ...setting, startsAt: later + MINUTE_MS }, T0);

    expect(set).toMatchObject({ ok: true, value: { isEnabled: true, startsAt: later, donationCount: 0 } });
    expect(edited).toMatchObject({ ok: true, value: { startsAt: later + MINUTE_MS } });
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
    expect(await events.getCharityEvent(canvasId)).toMatchObject({ state: { startsAt: later + MINUTE_MS } });
  });

  // En cours, tout se change : adresse, début, fin ; le worker lit l'adresse du moment
  it("lets the address, the start and the end change while the event runs", async () => {
    const { canvasId, events, store, launch } = await setup();
    await launch();

    const otherAddress = await events.setCharityEvent(
      canvasId,
      { ...setting, address: "streamlabscharity.com/@autre/campagne" },
      T0,
    );
    const moved = await events.setCharityEvent(canvasId, { ...setting, endsAt: ENDS + HOUR_MS }, T0);

    expect(otherAddress).toMatchObject({
      ok: true,
      value: { address: "streamlabscharity.com/@autre/campagne" },
    });
    expect(moved).toMatchObject({ ok: true, value: { endsAt: ENDS + HOUR_MS, address: ADDRESS } });
    expect(await store.listCharityReads(T0)).toMatchObject([{ canvasId, endsAt: ENDS + HOUR_MS }]);
  });

  // La fin est facultative : absente, elle se lit absente (pas 0), et une fin enregistrée avant s'efface
  it("keeps an absent end absent, reads it back as absent, and clears a previous end", async () => {
    const { canvasId, keys, events, store, charityKeys } = await setup();
    const withoutEnd = { isEnabled: true, title: TITLE, address: ADDRESS, startsAt: STARTS };

    await events.setCharityEvent(canvasId, setting, T0);
    expect(await events.getCharityEvent(canvasId)).toMatchObject({ state: { endsAt: ENDS } });
    expect(await store.listCharityReads(T0)).toMatchObject([{ canvasId, endsAt: ENDS }]);

    const cleared = await events.setCharityEvent(canvasId, withoutEnd, T0);
    const read = await events.getCharityEvent(canvasId);
    const reads = await store.listCharityReads(T0);

    expect(cleared).toMatchObject({ ok: true, value: { startsAt: STARTS } });
    expect(cleared.ok && "endsAt" in cleared.value).toBe(false);
    expect(read?.state && "endsAt" in read.state).toBe(false);
    expect(reads).toHaveLength(1);
    expect(reads[0] && "endsAt" in reads[0] && reads[0].endsAt !== undefined).toBe(false);
    expect(await redis.hget(keys.charityEvent, "endsAt")).not.toBe("0");
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);

    const again = await events.setCharityEvent(canvasId, setting, T0);
    expect(again).toMatchObject({ ok: true, value: { endsAt: ENDS } });
    expect(await store.listCharityReads(T0)).toMatchObject([{ canvasId, endsAt: ENDS }]);
  });

  // Sans fin, un événement après son début reste lu et compte les dons, quelle que soit l'heure
  it("reads an event without an end after its start, and counts donations at any later time", async () => {
    const { canvasId, events, store } = await setup();
    await events.setCharityEvent(
      canvasId,
      { isEnabled: true, title: TITLE, address: ADDRESS, startsAt: STARTS },
      T0,
    );
    const farLater = ENDS + 1_000 * HOUR_MS;

    expect(await store.listCharityReads(farLater)).toMatchObject([{ canvasId }]);
    const stored = await store.storeCharityDonations(
      canvasId,
      [donation("1", 500, farLater), donation("0", 500, STARTS - 1)],
      farLater,
    );

    expect(stored).toBe(1);
    expect(await events.getCharityEvent(canvasId)).toMatchObject({ state: { donationCount: 1 } });
  });

  // Un nouveau début remet l'événement à zéro : dons comptés, liste des dons, fil récent, réclamations, compteurs
  it("starts again from zero when the start changes: donations, feed, claims and counters", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0), donation("2", 250, T0)], T0);
    const claimer = await joinedUser(STARTS - HOUR_MS);
    expect(await events.claimCharityBonus(canvasId, claimer, T0)).toBe(75);
    expect(await redis.hlen(keys.charityDonations)).toBe(2);
    expect(await redis.zcard(keys.charityRecent)).toBe(2);
    expect(await redis.hlen(keys.charityClaims)).toBe(1);

    const restarted = await events.setCharityEvent(
      canvasId,
      { ...setting, startsAt: STARTS + MINUTE_MS },
      T0,
    );

    expect(restarted).toMatchObject({ ok: true, value: { startsAt: STARTS + MINUTE_MS, donationCount: 0 } });
    expect(await redis.hlen(keys.charityDonations)).toBe(0);
    expect(await redis.zcard(keys.charityRecent)).toBe(0);
    expect(await redis.hlen(keys.charityClaims)).toBe(0);
    expect(await redis.hget(keys.charityEvent, "totalCents")).toBe("0");
    expect(await events.getCharityBonus(canvasId, claimer, T0)).toBe(0);
  });

  // Désactiver clôt aussitôt ; réactiver avec le même début reprend là où l'événement en était
  it("stops at once when disabled, and resumes with its donations when enabled again with the same start", async () => {
    const { canvasId, keys, events, store, charityKeys, launch } = await setup();
    await launch();
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);
    const viewer = await joinedUser(STARTS - HOUR_MS);
    expect(await events.getCharityBonus(canvasId, viewer, T0)).toBe(50);

    const disabled = await events.setCharityEvent(canvasId, { ...setting, isEnabled: false }, T0);

    expect(disabled).toMatchObject({ ok: true, value: { isEnabled: false, donationCount: 1 } });
    expect(await redis.smembers(charityKeys.active)).toEqual([]);
    expect(await store.listCharityReads(T0)).toEqual([]);
    expect(await store.storeCharityDonations(canvasId, [donation("2", 250, T0)], T0)).toBe(0);
    expect(await events.getCharityBonus(canvasId, viewer, T0)).toBe(0);
    expect(await events.claimCharityBonus(canvasId, viewer, T0)).toBe(0);

    const enabled = await events.setCharityEvent(canvasId, setting, T0);

    expect(enabled).toMatchObject({ ok: true, value: { isEnabled: true, donationCount: 1 } });
    expect(await redis.hlen(keys.charityDonations)).toBe(1);
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
    expect(await store.listCharityReads(T0)).toHaveLength(1);
    expect(await events.getCharityBonus(canvasId, viewer, T0)).toBe(50);
  });

  // Le titre est nettoyé comme le thème ; vide, l'événement est inactif et rien n'est lu
  it("cleans the title like the theme of a canvas, and an empty one leaves the event inactive", async () => {
    const { canvasId, events, charityKeys } = await setup();

    for (const title of ["", "   ", "\n\t"]) {
      expect(await events.setCharityEvent(canvasId, { ...setting, title }, T0)).toMatchObject({
        ok: true,
        value: { title: "" },
      });
      expect(await redis.smembers(charityKeys.active)).toEqual([]);
    }
    const set = await events.setCharityEvent(canvasId, { ...setting, title: "  Live   du \n soir " }, T0);
    expect(set).toMatchObject({ ok: true, value: { title: "Live du soir" } });
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
  });

  // Sans adresse, l'événement a lieu, mais rien n'est lu ni offert
  it("holds an event without an address: it is on, nothing is read, no donation is stored, no bonus", async () => {
    const { canvasId, events, store, charityKeys } = await setup();
    const set = await events.setCharityEvent(
      canvasId,
      { isEnabled: true, title: TITLE, address: "", startsAt: STARTS, endsAt: ENDS },
      T0,
    );

    expect(set).toMatchObject({ ok: true, value: { isEnabled: true, title: TITLE, donationCount: 0 } });
    expect(set.ok && "address" in set.value).toBe(false);
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
    expect(await store.listCharityReads(T0)).toEqual([]);
    expect(await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0)).toBe(1);
    const blank = await events.setCharityEvent(canvasId, { ...setting, address: "  " }, T0);
    expect(blank).toMatchObject({ ok: true, value: { title: TITLE } });
  });

  // Une adresse qui n'est pas une page Streamlabs Charity garde l'événement inactif, jusqu'à ce qu'elle soit corrigée ou vidée
  it("keeps the event inactive with a wrong address, until it is fixed or emptied", async () => {
    const { canvasId, events, store, charityKeys } = await setup();

    await events.setCharityEvent(canvasId, { ...setting, address: "https://example.com/@a/b" }, T0);
    expect(await redis.smembers(charityKeys.active)).toEqual([]);
    expect(await store.listCharityReads(T0)).toEqual([]);
    expect(await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0)).toBe(0);

    await events.setCharityEvent(canvasId, setting, T0);
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
    expect(await store.listCharityReads(T0)).toHaveLength(1);

    await events.setCharityEvent(canvasId, { ...setting, address: "" }, T0);
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
    expect(await store.listCharityReads(T0)).toEqual([]);
  });

  // Une fin déjà passée n'est plus un défaut du réglage : l'événement est terminé, le worker le lit encore le délai de grâce puis le quitte,
  // et aucun don ne se remet à zéro tant que le début ne change pas
  it("keeps an event whose end is past, read for the grace delay only, and keeps its donations while the start stays", async () => {
    const { canvasId, keys, events, store, charityKeys, launch } = await setup();
    await launch();
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);

    const ended = await events.setCharityEvent(canvasId, { ...setting, endsAt: T0 - 1 }, T0);

    expect(ended).toMatchObject({ ok: true, value: { endsAt: T0 - 1, donationCount: 1 } });
    expect(await redis.smembers(charityKeys.active)).toEqual([canvasId]);
    expect(await store.listCharityReads(T0)).toHaveLength(1);
    expect(await store.listCharityReads(T0 + CHARITY_READ_GRACE_MS)).toEqual([]);
    expect(await redis.smembers(charityKeys.active)).toEqual([]);
    expect(await store.storeCharityDonations(canvasId, [donation("2", 500, T0)], T0)).toBe(0); // un don d'après la fin ne compte pas
    expect(await redis.hlen(keys.charityDonations)).toBe(1);
  });

  // Publie le réglage aux pages ouvertes
  it("tells the open pages about each change", async () => {
    const { canvasId, launch } = await setup();
    const messages: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => messages.push(message));

    await launch();
    await expect.poll(() => messages.length).toBe(1);
    await unsubscribe();

    expect(messages[0]).toMatchObject({
      ctl: { t: "charityEvent", state: { isEnabled: true, address: ADDRESS } },
    });
  });
});

describe("the donations", () => {
  // Un don écrit deux fois, ou lu par deux lecteurs, ne compte qu'une fois
  it("counts a donation once, however many times it is read", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();

    const first = await store.storeCharityDonations(
      canvasId,
      [donation("11", 500, T0), donation("12", 250, T0)],
      T0,
    );
    const again = await Promise.all([
      store.storeCharityDonations(canvasId, [donation("11", 500, T0), donation("13", 100, T0)], T0),
      store.storeCharityDonations(canvasId, [donation("13", 100, T0), donation("12", 250, T0)], T0),
    ]);

    expect([first, ...again].reduce((sum, count) => sum + count, 0)).toBe(3);
    expect(await events.getCharityEvent(canvasId)).toMatchObject({ state: { donationCount: 3 } });
    expect(await redis.hget(keys.charityEvent, "totalCents")).toBe("850");
  });

  // Ne compte que les dons faits entre le début et la fin, et rien sans événement
  it("counts only the donations made between the start and the end, and none without an event", async () => {
    const { canvasId, events, store, launch } = await setup();
    expect(await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0)).toBe(0);
    await launch();

    const stored = await store.storeCharityDonations(
      canvasId,
      [
        donation("1", 500, STARTS - 1),
        donation("2", 500, ENDS + 1),
        donation("3", 500, STARTS),
        donation("4", 0, T0),
      ],
      T0,
    );

    expect(stored).toBe(1);
    expect(await events.getCharityEvent(canvasId)).toMatchObject({ state: { donationCount: 1 } });
  });

  // Publie chaque don : le nom tel quel, le montant, la devise, les pixels, et le nombre de dons
  it("publishes each donation with its name as is, its amount, its pixels and the count", async () => {
    const { canvasId, store, launch } = await setup();
    await launch();
    const messages: LiveMessage[] = [];
    const unsubscribe = await core.subscribe(canvasId, (message) => messages.push(message));

    await store.storeCharityDonations(canvasId, [donation("21", 1234, T0, 'Zoé "la 🦊" <b>')], T0);
    await expect.poll(() => messages.length).toBe(1);
    await unsubscribe();

    expect(messages[0]).toEqual({
      ctl: {
        t: "donation",
        donationId: "21",
        name: 'Zoé "la 🦊" <b>',
        cents: 1234,
        currency: "EUR",
        pixels: 123,
        donationCount: 1,
      },
    });
  });
});

describe("the bonus", () => {
  // 1 € = 10 pixels, cumulé tant qu'il n'est pas réclamé, même pour un compte arrivé après le don
  it("gives 10 pixels per euro, piles up until claimed, and reaches an account that came after the donation", async () => {
    const { canvasId, events, store, launch } = await setup();
    await launch();
    const early = await joinedUser();
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);
    const late = await joinedUser();
    await store.storeCharityDonations(canvasId, [donation("2", 120, T0 + MINUTE_MS)], T0 + MINUTE_MS);
    const now = T0 + 2 * MINUTE_MS;

    expect(await events.getCharityBonus(canvasId, early, now)).toBe(62);
    expect(await events.getCharityBonus(canvasId, late, now)).toBe(62);
  });

  // Un geste réclame tout, une seule fois, et le reste attend le don suivant
  it("claims everything in one gesture, once, and the next donation waits", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    const user = await joinedUser();
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);

    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(50);
    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(0);
    await store.storeCharityDonations(canvasId, [donation("2", 70, T0)], T0);
    expect(await events.getCharityBonus(canvasId, user, T0)).toBe(7);
    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(7);

    expect(await redis.hget(keys.progress(user), "reserve")).toBe("57");
    expect(await redis.ttl(keys.progress(user))).toBe(-1);
  });

  // Arrondi vers le bas, sans perdre un centime entre deux réclamations : 15 puis 15 centimes font 1 puis 2 pixels, soit 3 centimes de dizaine
  it("rounds down without losing a cent between two claims", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    const user = await joinedUser();
    await store.storeCharityDonations(canvasId, [donation("1", 9, T0)], T0);
    expect(await events.getCharityBonus(canvasId, user, T0)).toBe(0);
    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(0);
    await store.storeCharityDonations(canvasId, [donation("2", 6, T0)], T0);
    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(1);
    await store.storeCharityDonations(canvasId, [donation("3", 15, T0)], T0);

    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(2);
    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(0);
    expect(await redis.hget(keys.progress(user), "reserve")).toBe("3");
  });

  // Un compte créé après le début ne réclame un don que dans l'heure qui suit ce don
  it("lets an account created after the start claim a donation only within the hour after it", async () => {
    const { canvasId, events, store, launch } = await setup();
    await launch();
    const veteran = await joinedUser(STARTS - HOUR_MS);
    const created = await joinedUser(T0 + 10 * MINUTE_MS);
    await store.storeCharityDonations(canvasId, [donation("1", 300, T0)], T0);
    await store.storeCharityDonations(
      canvasId,
      [donation("2", 200, T0 + 30 * MINUTE_MS)],
      T0 + 30 * MINUTE_MS,
    );
    const at = (minutes: number) => T0 + minutes * MINUTE_MS;

    expect(await events.getCharityBonus(canvasId, created, at(30))).toBe(50);
    expect(await events.getCharityBonus(canvasId, created, at(60))).toBe(50);
    expect(await events.getCharityBonus(canvasId, created, at(61))).toBe(20);
    expect(await events.getCharityBonus(canvasId, created, at(91))).toBe(0);
    expect(await events.getCharityBonus(canvasId, veteran, at(91))).toBe(50);
    expect(await events.claimCharityBonus(canvasId, created, at(61))).toBe(20);
    expect(await events.claimCharityBonus(canvasId, created, at(62))).toBe(0);
  });

  // Un compte banni ne reçoit rien
  it("gives nothing to a banned account", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    const user = await joinedUser();
    await redis.sadd(keys.bans, user);
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);

    expect(await events.getCharityBonus(canvasId, user, T0)).toBe(0);
    expect(await events.claimCharityBonus(canvasId, user, T0)).toBe(0);
  });

  // À la fin, le bonus non réclamé est perdu, mais la réserve déjà réclamée reste
  it("loses the unclaimed bonus at the end, and keeps the reserve already claimed", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    const [claimer, sleeper] = [await joinedUser(), await joinedUser()];
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);
    await events.claimCharityBonus(canvasId, claimer, T0);

    const after = ENDS + MINUTE_MS;

    expect(await events.getCharityBonus(canvasId, sleeper, after)).toBe(0);
    expect(await events.claimCharityBonus(canvasId, sleeper, after)).toBe(0);
    expect(await redis.hget(keys.progress(claimer), "reserve")).toBe("50");
    await events.setCharityEvent(
      canvasId,
      { isEnabled: true, title: TITLE, address: ADDRESS, startsAt: after, endsAt: after + HOUR_MS },
      after,
    );
    expect(await redis.hget(keys.progress(claimer), "reserve")).toBe("50");
    expect(await redis.exists(keys.charityDonations, keys.charityRecent, keys.charityClaims)).toBe(0);
  });
});

describe("the bonus without an end", () => {
  // Sans fin, le bonus n'est jamais perdu : il se réclame longtemps après
  it("never loses the unclaimed bonus, and can be claimed long after the former end", async () => {
    const { canvasId, events, store } = await setup();
    await events.setCharityEvent(
      canvasId,
      { isEnabled: true, title: TITLE, address: ADDRESS, startsAt: STARTS },
      T0,
    );
    const user = await joinedUser();
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);

    const later = ENDS + 1_000 * HOUR_MS;

    expect(await events.getCharityBonus(canvasId, user, later)).toBe(50);
    expect(await events.claimCharityBonus(canvasId, user, later)).toBe(50);
  });
});

describe("the reserve in the gauge", () => {
  const place = async (canvasId: string, userId: string, count: number, nowMs: number) => {
    const result = await core.place(canvasId, {
      userId,
      requestId: randomUUID(),
      placementId: "pevent0001",
      nowMs,
      pixels: Array.from({ length: count }, (_, x) => ({ x, y: 0, colorIndex: 1 })),
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };

  // Dépensée avant la jauge, sans recharge, et la jauge normale garde ses règles
  it("is spent before the gauge, never refills, and leaves the normal gauge to its rules", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    const user = await joinedUser();
    await store.storeCharityDonations(canvasId, [donation("1", 300, T0)], T0);
    await events.claimCharityBonus(canvasId, user, T0);

    const first = await place(canvasId, user, 10, T0);
    expect(first).toMatchObject({ accepted: 10, gauge: { charges: 50, reserve: 20 } });
    const second = await place(canvasId, user, 25, T0);
    expect(second).toMatchObject({ accepted: 25, gauge: { charges: 45, reserve: 0 } });

    const later = await place(canvasId, user, 1, T0 + 10_000);
    expect(later.gauge.reserve).toBe(0);
    expect(await redis.hget(keys.progress(user), "reserve")).toBe("0");
    expect(await core.getGauge(canvasId, user, T0 + 10_000)).toMatchObject({ reserve: 0 });
  });

  // Reste après l'événement, et se dépense jusqu'à zéro sans que la jauge soit touchée à ce moment
  it("stays after the event is switched off, and a gauge already empty draws on it", async () => {
    const { canvasId, events, store, launch } = await setup();
    await launch();
    const user = await joinedUser();
    await place(canvasId, user, 50, T0);
    await store.storeCharityDonations(canvasId, [donation("1", 80, T0)], T0);
    await events.claimCharityBonus(canvasId, user, T0);
    await events.setCharityEvent(
      canvasId,
      { isEnabled: false, title: TITLE, address: ADDRESS, startsAt: STARTS, endsAt: ENDS },
      T0 + MINUTE_MS,
    );

    const result = await place(canvasId, user, 8, T0);

    expect(result).toMatchObject({ accepted: 8, gauge: { charges: 0, reserve: 0 } });
  });
});

describe("the reads of the worker", () => {
  // Lit la fresque dont l'événement est en cours, pas celle d'un événement à venir ni d'une archive
  it("lists the running event, neither an upcoming one nor an archived canvas", async () => {
    const running = await setup();
    const upcoming = await setup();
    await running.launch();
    await upcoming.events.setCharityEvent(
      upcoming.canvasId,
      { isEnabled: true, title: TITLE, address: ADDRESS, startsAt: T0 + HOUR_MS, endsAt: ENDS },
      T0,
    );

    expect(await running.store.listCharityReads(T0)).toEqual([
      {
        canvasId: running.canvasId,
        source: { kind: "user", user: "grenneh_", campaign: "dames-4-games-2026" },
        startsAt: STARTS,
        endsAt: ENDS,
      },
    ]);
    expect(await upcoming.store.listCharityReads(T0 + HOUR_MS)).toHaveLength(1);
    await redis.hset(upcoming.keys.meta, "archivedAt", T0);
    expect(await upcoming.store.listCharityReads(T0 + HOUR_MS)).toEqual([]);
  });

  // Lit encore 2 minutes après la fin, puis l'oublie, ainsi qu'une fresque supprimée
  it("reads 2 more minutes after the end, then forgets it, as it forgets a deleted canvas", async () => {
    const ended = await setup();
    const gone = await setup();
    await ended.launch(T0 + MINUTE_MS);
    await gone.launch();
    await redis.del(gone.keys.charityEvent);

    expect(await ended.store.listCharityReads(T0 + 2 * MINUTE_MS)).toHaveLength(1);
    expect(await ended.store.listCharityReads(T0 + 4 * MINUTE_MS)).toEqual([]);
    expect(await redis.smembers(ended.charityKeys.active)).toEqual([]);
    expect(await gone.store.listCharityReads(T0)).toEqual([]);
  });

  // Un seul lecteur à la fois, et seul celui qui a le verrou le rend
  it("lets one reader at a time, and only its holder gives the lock back", async () => {
    const { canvasId, store } = await setup();

    expect(await store.lockCharityRead(canvasId, "a", 30_000)).toBe(true);
    expect(await store.lockCharityRead(canvasId, "b", 30_000)).toBe(false);
    await store.unlockCharityRead(canvasId, "b");
    expect(await store.lockCharityRead(canvasId, "b", 30_000)).toBe(false);
    await store.unlockCharityRead(canvasId, "a");
    expect(await store.lockCharityRead(canvasId, "b", 30_000)).toBe(true);
  });
});

describe("the deletion of an account", () => {
  // Le compte supprimé ne laisse rien dans les réclamations de l'événement, ni sa réserve
  it("leaves nothing of the account in the claims of the event, nor its reserve", async () => {
    const { canvasId, keys, events, store, launch } = await setup();
    await launch();
    const [gone, kept] = [await joinedUser(), await joinedUser()];
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);
    await events.claimCharityBonus(canvasId, gone, T0);
    await events.claimCharityBonus(canvasId, kept, T0);

    await createAccountPurge(redis, harness.secret).purgeTraces(gone);

    expect(await redis.hkeys(keys.charityClaims)).toEqual([kept]);
    expect(await redis.exists(keys.progress(gone))).toBe(0);
  });
});

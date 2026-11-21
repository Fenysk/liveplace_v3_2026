import { randomUUID } from "node:crypto";
import { type CanvasMeta, defaultCanvasMeta, HOUR_MS, MINUTE_MS, type Session } from "@liveplace/domain";
import type { CharityDonation } from "@liveplace/domain/charity-event";
import type { ClientSocket } from "@liveplace/domain/ports";
import { PROTOCOL_VERSION, type ServerFrame } from "@liveplace/protocol";
import { createCharityDonationStore, createEventCore } from "@liveplace/redis-core";
import { describe, expect, it } from "vitest";
import { createRedisHarness } from "../../../../packages/redis-core/src/test-harness";
import { createBroadcast } from "../usecase/broadcast";
import { createConnection } from "../usecase/connection";

// CDC 2026 §8, Mode événement : du réglage du streamer au bonus réclamé, sur un vrai Redis, avec le vrai canal de dons du worker.
const harness = createRedisHarness();
const { redis, core, runId } = harness;

const ADDRESS = "https://streamlabscharity.com/@grenneh_/dames-4-games-2026";
const T0 = Date.UTC(2026, 10, 20, 12, 0);
const STARTS = T0 - HOUR_MS;
const ENDS = T0 + 5 * HOUR_MS;

const donation = (id: string, cents: number, donatedAt: number): CharityDonation => ({
  id,
  name: "Julie",
  cents,
  currency: "EUR",
  donatedAt,
});

const account = async (login: string, createdAt?: number): Promise<Session> => {
  const userId = `${runId}-${login}-${randomUUID()}`;
  const session = { userId, login, displayName: login };
  await core.setUser(session);
  if (createdAt !== undefined) await redis.hset(`user:${userId}`, "createdAt", createdAt);
  return session;
};

// Une fresque, son streamer, un événement sur un index à lui, et les pages qui s'y connectent, sur un seul gateway.
const setup = async (ownerLogin = "grenneh_", archivedAt?: number) => {
  const owner = await account(ownerLogin);
  const { canvasId } = await harness.readyCanvas({
    ...defaultCanvasMeta(owner.userId),
    width: 8,
    height: 8,
    ...(archivedAt === undefined ? {} : { archivedAt }),
  } satisfies CanvasMeta);
  const charityKeys = harness.uniqueCharityKeys();
  const event = createEventCore(redis, charityKeys);
  const store = createCharityDonationStore(redis, charityKeys);
  const broadcast = createBroadcast(core);
  const clock = { nowMs: T0 };
  const deps = {
    core,
    event,
    broadcast,
    activity: {
      join: () => ({ setRole: () => undefined, leave: () => undefined }),
      countPixels: () => undefined,
      watch: () => undefined,
      listHistory: async () => null,
      listDay: async () => null,
      forgetOwner: () => undefined,
    },
    capacity: {
      watch: () => undefined,
      listHistory: async () => null,
      countRefusedPlacement: () => undefined,
    },
    connections: { add: () => () => undefined },
    now: () => clock.nowMs,
  };
  const open = async (session: Session | null, mode: "ui" | "obs" = "ui") => {
    const sent: (ServerFrame | { snapshot: Uint8Array })[] = [];
    const socket: ClientSocket = {
      sendFrame: (frame) => {
        sent.push(frame);
      },
      sendSnapshot: (state) => {
        sent.push({ snapshot: state });
      },
      close: () => undefined,
    };
    const connection = createConnection(deps, socket, session, "desktop");
    await connection.receive(
      JSON.stringify({ t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId, mode }),
    );
    const framesOf = (t: string) => sent.filter((frame) => "t" in frame && frame.t === t);
    const send = (frame: Record<string, unknown>) => connection.receive(JSON.stringify(frame));
    return { sent, framesOf, send };
  };
  const setting = {
    t: "setCharityEvent",
    requestId: "set-1",
    isEnabled: true,
    title: "Live caritatif",
    address: ADDRESS,
    startsAt: STARTS,
    endsAt: ENDS,
  };
  return { owner, canvasId, store, clock, open, setting };
};

describe("the charity event, from the owner's setting to the claimed bonus", () => {
  // Du réglage du streamer au bonus d'un compte, avec l'invité qui voit sans bonus et la vue OBS qui ne voit rien
  it("goes from the setting to the claimed bonus: an account gets it, a guest sees the donation without it, the OBS view sees nothing", async () => {
    const { owner, canvasId, store, open, setting } = await setup();
    const viewerSession = await account("viewer");
    const [ownerPage, viewer, guest, obs] = [
      await open(owner),
      await open(viewerSession),
      await open(null),
      await open(null, "obs"),
    ];
    expect(viewer.sent[0]).toMatchObject({ t: "welcome" });
    expect(viewer.sent[0]).not.toHaveProperty("charityEvent.state");

    await ownerPage.send(setting);
    await expect.poll(() => viewer.framesOf("charityEvent").length).toBe(1);
    await store.storeCharityDonations(canvasId, [donation("1", 500, T0)], T0);
    await expect
      .poll(() => viewer.framesOf("charityBonus").at(-1))
      .toEqual({ t: "charityBonus", pending: 50 });

    expect(viewer.framesOf("charityEvent")[0]).toMatchObject({
      state: { isEnabled: true, address: ADDRESS },
    });
    expect(viewer.framesOf("charityDonation")).toEqual([
      {
        t: "charityDonation",
        donationId: "1",
        name: "Julie",
        cents: 500,
        currency: "EUR",
        pixels: 50,
        donationCount: 1,
      },
    ]);
    expect(ownerPage.framesOf("charityEvent")).toHaveLength(1);
    expect(guest.framesOf("charityEvent")).toHaveLength(1);
    expect(guest.framesOf("charityDonation")).toHaveLength(1);
    expect(guest.framesOf("charityBonus")).toEqual([]);
    for (const type of ["charityEvent", "charityDonation", "charityBonus"])
      expect(obs.framesOf(type)).toEqual([]);

    await viewer.send({ t: "claimCharityBonus", requestId: "claim-1" });
    await expect.poll(() => viewer.framesOf("charityBonusClaimed").length).toBe(1);

    expect(viewer.framesOf("charityBonusClaimed")[0]).toMatchObject({
      requestId: "claim-1",
      pixels: 50,
      gauge: { reserve: 50 },
    });
    await expect
      .poll(() => viewer.framesOf("charityBonus").at(-1))
      .toEqual({ t: "charityBonus", pending: 0 });
    await viewer.send({ t: "claimCharityBonus", requestId: "claim-2" });
    await expect.poll(() => viewer.framesOf("charityBonusClaimed").length).toBe(2);
    expect(viewer.framesOf("charityBonusClaimed")[1]).toMatchObject({ requestId: "claim-2", pixels: 0 });
  });

  // Un arrivant trouve l'événement dans son welcome, et son bonus après
  it("gives an arriving account the event in its welcome, then its bonus", async () => {
    const { owner, canvasId, store, open, setting } = await setup();
    await (await open(owner)).send(setting);
    await store.storeCharityDonations(canvasId, [donation("1", 120, T0)], T0);

    const arrival = await open(await account("viewer"));

    expect(arrival.sent[0]).toMatchObject({
      t: "welcome",
      charityEvent: { state: { isEnabled: true, donationCount: 1 } },
    });
    expect(arrival.framesOf("charityBonus")).toEqual([{ t: "charityBonus", pending: 12 }]);
  });

  // Sans adresse, l'événement a lieu avec son titre, mais personne ne lit rien : ni don, ni bonus
  it("accepts an event without a donation page: it shows its title, and nothing is read", async () => {
    const { owner, store, open, setting } = await setup();
    const ownerPage = await open(owner);

    await ownerPage.send({ ...setting, address: "" });
    await expect.poll(() => ownerPage.framesOf("charityEvent").length).toBe(1);

    const state = (ownerPage.framesOf("charityEvent")[0] as { state: Record<string, unknown> }).state;
    expect(state).toMatchObject({ isEnabled: true, title: "Live caritatif" });
    expect(state).not.toHaveProperty("address");
    expect(await store.listCharityReads(T0)).toEqual([]);
  });

  // Le streamer de n'importe quelle fresque règle l'événement : il le reçoit, sans refus
  it("accepts the setting of any streamer, not only a listed one", async () => {
    const { owner, open, setting } = await setup("astrena_");
    const ownerPage = await open(owner);

    await ownerPage.send(setting);
    await expect.poll(() => ownerPage.framesOf("charityEvent").length).toBe(1);

    expect(ownerPage.framesOf("charityEvent")[0]).toMatchObject({
      state: { isEnabled: true, address: ADDRESS },
    });
    expect(ownerPage.framesOf("error")).toEqual([]);
    expect(ownerPage.sent[0]).toHaveProperty("charityEvent");
  });

  // Seul le streamer règle ; une archive refuse tout
  it("lets only the owner set the event, and refuses an archive", async () => {
    const { open, setting } = await setup();
    const viewer = await open(await account("viewer"));
    await viewer.send(setting);
    expect(viewer.sent.at(-1)).toEqual({ t: "error", code: "forbidden", requestId: "set-1" });

    const archived = await setup("grenneh_", T0 - HOUR_MS);
    const ownerPage = await archived.open(archived.owner);
    await ownerPage.send(archived.setting);
    expect(ownerPage.sent.at(-1)).toEqual({ t: "error", code: "canvas_archived", requestId: "set-1" });
  });

  // Un invité qui réclame est refusé
  it("refuses a guest who claims", async () => {
    const { owner, open, setting } = await setup();
    await (await open(owner)).send(setting);
    const guest = await open(null);

    await guest.send({ t: "claimCharityBonus", requestId: "claim-1" });

    expect(guest.sent.at(-1)).toEqual({ t: "error", code: "unauthenticated", requestId: "claim-1" });
  });

  // Un compte neuf perd son bonus au bout d'une heure : la réclamation dit 0 pixel, et la page reçoit son bonus juste
  it("answers zero pixels to a new account whose hour has passed, and sends it the right bonus", async () => {
    const { owner, canvasId, store, clock, open, setting } = await setup();
    await (await open(owner)).send(setting);
    const viewer = await open(await account("viewer", STARTS + MINUTE_MS));
    await store.storeCharityDonations(canvasId, [donation("1", 300, T0)], T0);
    await expect
      .poll(() => viewer.framesOf("charityBonus").at(-1))
      .toEqual({ t: "charityBonus", pending: 30 });

    clock.nowMs = T0 + HOUR_MS + MINUTE_MS;
    await viewer.send({ t: "claimCharityBonus", requestId: "claim-1" });
    await expect.poll(() => viewer.framesOf("charityBonusClaimed").length).toBe(1);

    expect(viewer.framesOf("charityBonusClaimed")[0]).toMatchObject({ requestId: "claim-1", pixels: 0 });
    expect(viewer.framesOf("charityBonus").at(-1)).toEqual({ t: "charityBonus", pending: 0 });
  });
});

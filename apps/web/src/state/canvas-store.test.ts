import { setImmediate as nextTurn } from "node:timers/promises";
import { PALETTE, toStateOffset } from "@liveplace/domain";
import type { AckFrame, Transport, TransportListeners } from "@liveplace/domain/ports";
import { type ClientFrame, PROTOCOL_VERSION, type ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import {
  type Arrival,
  type CanvasStoreOptions,
  type ConfirmedPixel,
  createCanvasStore,
} from "./canvas-store";

const width = 4;
const now = 1_700_000_000_000;
const PLACEMENT_ID = "ptest0001";
const gauge = { charges: 3, max: 10, nextRefillAt: now + 10_000, claimable: 0 };

const welcome: ServerFrame = {
  t: "welcome",
  canvas: { canvasId: "canvas-1", width, height: 4, ownerId: "owner-1" },
  params: {
    gaugeMaxStart: 10,
    gaugeMaxCeiling: 150,
    refillMs: 10_000,
    refillCharges: 1,
    obsDelayMs: 5000,
    obsBackground: "transparent",
  },
  palette: [...PALETTE],
  version: 7,
  you: { userId: "user-1", login: "user1", displayName: "User 1", role: "viewer" },
  gauge,
};

type PlaceFrame = Extract<ClientFrame, { t: "place" }>;

// `isWelcomed` à faux : la page vient de s'ouvrir, le gateway n'a pas encore répondu.
type SetupOptions = { storeOptions?: Partial<CanvasStoreOptions>; isWelcomed?: boolean };

const setup = ({ storeOptions = {}, isWelcomed = true }: SetupOptions = {}) => {
  const sent: ClientFrame[] = [];
  const listening: { listeners?: TransportListeners } = {};
  const transportState = { isClosed: false };
  const transport: Transport = {
    send: (frame) => {
      sent.push(frame);
    },
    listen: (listeners) => {
      listening.listeners = listeners;
    },
    close: () => {
      transportState.isClosed = true;
    },
  };
  const clock = { nowMs: now };
  const reloads: string[] = [];
  const store = createCanvasStore("canvas-1", transport, {
    mode: "ui",
    now: () => clock.nowMs,
    reload: () => reloads.push("reload"),
    ...storeOptions,
  });
  const receive = (frame: ServerFrame) => listening.listeners?.onFrame(frame);
  const open = () => listening.listeners?.onOpen();
  const snapshot = (state: Uint8Array) => listening.listeners?.onSnapshot(state);
  open();
  if (isWelcomed) receive(welcome);
  const lastPlace = (): PlaceFrame => {
    const frame = sent.at(-1);
    if (frame?.t !== "place") throw new Error("aucune frame place envoyée");
    return frame;
  };
  const ackOf = (frame: PlaceFrame, rejectedIndexes: number[] = []): AckFrame => ({
    t: "ack",
    requestId: frame.requestId,
    accepted: frame.pixels.length - rejectedIndexes.length,
    rejected: rejectedIndexes.map((index) => ({ index, reason: "gauge" })),
    gauge: { ...gauge, charges: 1 },
  });
  const pixelAt = (x: number, y: number) => store.getView().pixels[toStateOffset(x, y, width)];
  const close = (code = 1006) => listening.listeners?.onClose(code);
  return {
    store,
    sent,
    receive,
    lastPlace,
    ackOf,
    pixelAt,
    close,
    open,
    snapshot,
    clock,
    reloads,
    transportState,
  };
};

const cellsFrame = (x: number, y: number, colorIndex: number): ServerFrame => ({
  t: "cells",
  toVersion: 8,
  cells: [{ x, y, colorIndex, previousColorIndex: 0, placedAt: now, version: 8, kind: "place" }],
});

describe("a canvas the gateway does not know (§4.2)", () => {
  // Le canvas existe de nouveau : le welcome démentit canvas_not_found, la page reprend d'elle-même
  it("forgets canvas_not_found when a welcome comes", () => {
    const { store, receive, close, open } = setup({ isWelcomed: false });
    receive({ t: "error", code: "canvas_not_found" });
    close();

    expect(store.getView()).toMatchObject({ lastError: "canvas_not_found", status: "reconnecting" });

    open();
    receive(welcome);

    expect(store.getView()).toMatchObject({ lastError: null, status: "live" });
  });

  // Un autre refus survit à un welcome : seul canvas_not_found est démenti par lui
  it("keeps any other refusal across a welcome", () => {
    const { store, receive } = setup();
    receive({ t: "error", code: "rate_limited" });
    receive(welcome);

    expect(store.getView().lastError).toBe("rate_limited");
  });
});

describe("a canvas being recovered (Écart §4.2, JOURNAL 2026-10-08)", () => {
  // Le canvas revient : le welcome démentit canvas_recovering, la page reprend d'elle-même
  it("forgets canvas_recovering when a welcome comes, and goes on reconnecting until then", () => {
    const { store, receive, close, open } = setup({ isWelcomed: false });
    receive({ t: "error", code: "canvas_recovering" });
    close();

    expect(store.getView()).toMatchObject({ lastError: "canvas_recovering", status: "reconnecting" });

    open();
    receive(welcome);

    expect(store.getView()).toMatchObject({ lastError: null, status: "live" });
  });

  // Une page qui jouait quand Redis a tout perdu reprend un snapshot entier au welcome suivant, sans erreur gardée
  it("takes a whole snapshot again when the canvas comes back to a page that was playing", () => {
    const { store, receive, close, open } = setup();
    receive({ t: "error", code: "canvas_recovering" });
    close();
    open();

    receive({ ...welcome, version: 1_000_275 });

    expect(store.getView()).toMatchObject({ lastError: null, version: 1_000_275 });
  });
});

// Le web répond quand on le lui demande : `answer` dit « rien ne le ramènera », `fail` est une panne du web.
const webConfirmation = () => {
  const asked: string[] = [];
  const pending = {
    answer: (_isMissing: boolean): void => undefined,
    fail: (_error: Error): void => undefined,
  };
  const isMissingConfirmed = (canvasId: string) =>
    new Promise<boolean>((resolve, reject) => {
      asked.push(canvasId);
      pending.answer = resolve;
      pending.fail = reject;
    });
  return { asked, isMissingConfirmed, pending };
};

describe("a canvas the gateway cannot find, which the web confirms (Écart §4.2, JOURNAL 2026-10-09)", () => {
  // Tant que le web n'a pas répondu, la page ne dit ni « introuvable » ni rien d'autre : elle ne ment pas
  it("says neither missing nor recovering while the web has not answered, and asks about this canvas", () => {
    const web = webConfirmation();
    const { store, receive } = setup({ storeOptions: { isMissingConfirmed: web.isMissingConfirmed } });

    receive({ t: "error", code: "canvas_not_found" });

    expect(store.getView().lastError).toBeNull();
    expect(web.asked).toEqual(["canvas-1"]);
  });

  // Le web sait qu'une sauvegarde peut le ramener : la page passe directement au message d'attente, jamais à « introuvable »
  it("goes straight to canvas_recovering when the web says the canvas can come back", async () => {
    const web = webConfirmation();
    const { store, receive } = setup({ storeOptions: { isMissingConfirmed: web.isMissingConfirmed } });
    const seen: (string | null)[] = [];
    store.subscribe(() => seen.push(store.getView().lastError));

    receive({ t: "error", code: "canvas_not_found" });
    web.pending.answer(false);
    await nextTurn();

    expect(store.getView().lastError).toBe("canvas_recovering");
    expect(seen).not.toContain("canvas_not_found");
  });

  // Un vrai canvas introuvable (rien à remettre en place) garde son message, une fois le web d'accord
  it("keeps canvas_not_found once the web confirms nothing will bring the canvas back", async () => {
    const web = webConfirmation();
    const { store, receive } = setup({ storeOptions: { isMissingConfirmed: web.isMissingConfirmed } });

    receive({ t: "error", code: "canvas_not_found" });
    web.pending.answer(true);
    await nextTurn();

    expect(store.getView().lastError).toBe("canvas_not_found");
  });

  // Un web qui ne répond pas ne fait pas dire à la page que le canvas n'existe pas : elle attend, et redemandera
  it("waits rather than saying missing when the web fails to answer", async () => {
    const web = webConfirmation();
    const { store, receive } = setup({ storeOptions: { isMissingConfirmed: web.isMissingConfirmed } });

    receive({ t: "error", code: "canvas_not_found" });
    web.pending.fail(new Error("le web a coupé"));
    await nextTurn();

    expect(store.getView().lastError).toBe("canvas_recovering");
  });

  // Une réponse qui arrive après le welcome ne remet pas d'erreur : le canvas est revenu entre-temps
  it("drops an answer that comes after a welcome", async () => {
    const web = webConfirmation();
    const { store, receive, close, open } = setup({
      storeOptions: { isMissingConfirmed: web.isMissingConfirmed },
    });
    receive({ t: "error", code: "canvas_not_found" });
    close();
    open();
    receive(welcome);

    web.pending.answer(true);
    await nextTurn();

    expect(store.getView()).toMatchObject({ lastError: null, status: "live" });
  });

  // Un canvas confirmé introuvable n'est pas redemandé à chaque reprise de la socket : Convex n'est pas lu en boucle
  it("does not ask again at the next reconnection once the canvas is confirmed missing", async () => {
    const web = webConfirmation();
    const { store, receive, close, open } = setup({
      storeOptions: { isMissingConfirmed: web.isMissingConfirmed },
    });
    receive({ t: "error", code: "canvas_not_found" });
    web.pending.answer(true);
    await nextTurn();
    close();
    open();

    receive({ t: "error", code: "canvas_not_found" });

    expect(web.asked).toEqual(["canvas-1"]);
    expect(store.getView().lastError).toBe("canvas_not_found");
  });

  // Mais si le web a dit « il revient » et que le gateway ne le trouve toujours pas, la page redemande
  it("asks again when the web said it comes back and the gateway still cannot find it", async () => {
    const web = webConfirmation();
    const { store, receive, close, open } = setup({
      storeOptions: { isMissingConfirmed: web.isMissingConfirmed },
    });
    receive({ t: "error", code: "canvas_not_found" });
    web.pending.answer(false);
    await nextTurn();
    close();
    open();

    receive({ t: "error", code: "canvas_not_found" });
    web.pending.answer(true);
    await nextTurn();

    expect(web.asked).toEqual(["canvas-1", "canvas-1"]);
    expect(store.getView().lastError).toBe("canvas_not_found");
  });

  // Le gateway dit déjà « en récupération » : rien à confirmer
  it("asks nothing when the gateway itself says the canvas is being recovered", () => {
    const web = webConfirmation();
    const { store, receive } = setup({ storeOptions: { isMissingConfirmed: web.isMissingConfirmed } });

    receive({ t: "error", code: "canvas_recovering" });

    expect(web.asked).toEqual([]);
    expect(store.getView().lastError).toBe("canvas_recovering");
  });

  // La vue OBS reste vide et silencieuse : elle ne demande rien au web
  it("asks nothing in the OBS view", () => {
    const web = webConfirmation();
    const { store, receive } = setup({
      storeOptions: { mode: "obs", isMissingConfirmed: web.isMissingConfirmed },
    });

    receive({ t: "error", code: "canvas_not_found" });

    expect(web.asked).toEqual([]);
    expect(store.getView().lastError).toBe("canvas_not_found");
  });

  // Une page fermée (elle change de canvas) ne reçoit plus rien de la réponse qu'elle attendait
  it("drops an answer that comes after the page closed the store", async () => {
    const web = webConfirmation();
    const { store, receive } = setup({ storeOptions: { isMissingConfirmed: web.isMissingConfirmed } });
    receive({ t: "error", code: "canvas_not_found" });
    store.close();

    web.pending.answer(true);
    await nextTurn();

    expect(store.getView().lastError).toBeNull();
  });
});

describe("the gauge (§9.4)", () => {
  // Prend la jauge et l'identité dans le welcome
  it("takes the gauge and the identity from the welcome", () => {
    const { store } = setup();

    expect(store.getView()).toMatchObject({ gauge, userId: "user-1", params: welcome.params });
  });

  // Garde le pseudo et le nom de la personne connectée : sa pill Compte mène à son canvas (CDC 2026, Profils)
  it("keeps the signed-in login and display name for the account pill", () => {
    const { store } = setup();

    expect(store.getView()).toMatchObject({ login: "user1", displayName: "User 1" });
  });

  // Garde la photo Twitch de la personne connectée, quand le gateway l'envoie (écart §4.3, JOURNAL 2026-09-24)
  it("keeps the signed-in Twitch photo when the gateway sends it", () => {
    const { store, receive } = setup();
    const avatarUrl = "https://static-cdn.jtvnw.net/jtv_user_pictures/fenysk-profile_image-300x300.png";

    receive({ ...welcome, you: { ...welcome.you, avatarUrl } } as ServerFrame);

    expect(store.getView().avatarUrl).toBe(avatarUrl);
  });

  // Prend la jauge de chaque ack et de chaque frame gauge
  it("takes the gauge from every ack and every gauge frame", () => {
    const { store, receive } = setup();

    receive({ t: "ack", requestId: "other", accepted: 1, rejected: [], gauge: { ...gauge, charges: 2 } });
    expect(store.getView().gauge?.charges).toBe(2);

    receive({ t: "gauge", ...gauge, charges: 5 });
    expect(store.getView().gauge?.charges).toBe(5);
  });

  // Efface le dernier refus à chaque ack
  it("clears the last refusal on every ack", () => {
    const { store, receive } = setup();
    receive({ t: "error", code: "rate_limited" });

    receive({ t: "ack", requestId: "other", accepted: 1, rejected: [], gauge });

    expect(store.getView().lastError).toBeNull();
  });
});

describe("placeBatch (§9.2, §9.3)", () => {
  // Écrit les pixels tout de suite, avant la réponse, et les envoie dans une seule frame
  it("writes the pixels at once, before the answer, and sends them in one frame", () => {
    const { store, lastPlace, pixelAt } = setup();

    void store.placeBatch(
      [
        { x: 1, y: 2, colorIndex: 5 },
        { x: 2, y: 2, colorIndex: 6 },
      ],
      PLACEMENT_ID,
    );

    expect(pixelAt(1, 2)).toBe(5);
    expect(pixelAt(2, 2)).toBe(6);
    expect(lastPlace().pixels).toHaveLength(2);
  });

  // Se résout sur l'ack du même requestId, jamais sur celui d'un autre
  it("resolves on the ack of the same requestId, never on another one", async () => {
    const { store, receive, lastPlace, ackOf } = setup();
    let settled = false;
    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID).then((result) => {
      settled = true;
      return result;
    });

    receive({ ...ackOf(lastPlace()), requestId: "other" });
    await Promise.resolve();
    expect(settled).toBe(false);

    const ack = ackOf(lastPlace());
    receive(ack);
    expect(await placing).toEqual({ ok: true, value: ack });
  });

  // Rend sa couleur d'avant à un pixel refusé, et garde l'accepté
  it("gives a rejected pixel its previous color back, and keeps the accepted one", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();
    receive(cellsFrame(2, 2, 9));

    const placing = store.placeBatch(
      [
        { x: 1, y: 2, colorIndex: 5 },
        { x: 2, y: 2, colorIndex: 6 },
      ],
      PLACEMENT_ID,
    );
    receive(ackOf(lastPlace(), [1]));
    await placing;

    expect(pixelAt(1, 2)).toBe(5);
    expect(pixelAt(2, 2)).toBe(9);
  });

  // Laisse à une frame cells passée entre-temps le dernier mot sur un pixel refusé
  it("lets a cells frame that came in between have the last word on a rejected pixel", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive(cellsFrame(1, 2, 12));
    receive(ackOf(lastPlace(), [0]));
    await placing;

    expect(pixelAt(1, 2)).toBe(12);
  });

  // Garde un pixel accepté quand l'ack arrive avant sa frame cells, puis prend la frame
  it("keeps an accepted pixel when the ack comes before its cells frame, then takes the frame", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive(ackOf(lastPlace()));
    await placing;
    expect(pixelAt(1, 2)).toBe(5);

    receive(cellsFrame(1, 2, 5));
    expect(pixelAt(1, 2)).toBe(5);
    expect(store.getView().version).toBe(8);
  });

  // Se résout sur le code d'erreur que le gateway envoie à la place de l'ack, et rend les couleurs d'avant
  it("resolves with the error code the gateway sends instead of an ack, and restores the colors", async () => {
    const { store, receive, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive({ t: "error", code: "unauthenticated" });

    expect(await placing).toEqual({ ok: false, error: "unauthenticated" });
    expect(pixelAt(1, 2)).toBe(0);
  });

  // Résout en refus le lot que le gateway refuse en le nommant (§6.3 : 10 poses par seconde), rend les couleurs d'avant, redessine,
  // et laisse la jauge et le dernier refus tels quels
  it("settles a lot the gateway refuses by name as a refusal, gives the colors back and redraws", async () => {
    const { store, receive, lastPlace, pixelAt } = setup();
    let redraws = 0;
    store.subscribe(() => {
      redraws += 1;
    });

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const redrawsBefore = redraws;
    receive({ t: "error", code: "rate_limited", requestId: lastPlace().requestId });

    expect(await placing).toEqual({ ok: false, error: "rate_limited" });
    expect(pixelAt(1, 2)).toBe(0);
    expect(redraws).toBeGreaterThan(redrawsBefore);
    expect(store.getView()).toMatchObject({ gauge, lastError: null });
  });

  // Ne refuse que le lot nommé : un autre lot en attente garde sa pose optimiste et sa promesse
  it("refuses only the lot it names: another pending lot keeps its optimistic pixel and its promise", async () => {
    const { store, receive, sent, pixelAt } = setup();
    let isOtherSettled = false;

    const refused = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const refusedFrame = sent.at(-1);
    void store.placeBatch([{ x: 2, y: 2, colorIndex: 6 }], PLACEMENT_ID).then(() => {
      isOtherSettled = true;
    });
    if (refusedFrame?.t !== "place") throw new Error("aucune frame place envoyée");
    receive({ t: "error", code: "rate_limited", requestId: refusedFrame.requestId });
    await refused;

    expect(isOtherSettled).toBe(false);
    expect(pixelAt(1, 2)).toBe(0);
    expect(pixelAt(2, 2)).toBe(6);
  });

  // Rouvre après une fermeture en 1013 (§6.3, « réessayez plus tard ») comme après toute coupure : reprise par lastVersion, lot gardé
  it("reconnects after a 1013 close like after any drop: resumes from lastVersion and keeps the lot", async () => {
    const { store, sent, close, open, receive, lastPlace, ackOf, pixelAt } = setup();
    receive(cellsFrame(2, 2, 9));
    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const first = lastPlace();

    close(1013);

    expect(store.getView().status).toBe("reconnecting");
    expect(pixelAt(1, 2)).toBe(5);
    open();
    expect(sent.at(-1)).toMatchObject({ t: "hello", lastVersion: 8 });
    receive(welcome);
    expect(lastPlace()).toEqual(first);
    const ack = ackOf(first);
    receive(ack);
    expect(await placing).toEqual({ ok: true, value: ack });
  });

  // Garde un lot parti avant une coupure, couleurs comprises, et le renvoie avec son requestId au welcome suivant
  // (CDC 2026, Envoi ; ce test attendait « closed » avant la reconnexion, JOURNAL 2026-09-25)
  it("keeps a batch sent before a drop, colors included, and sends it again with its requestId after the welcome", async () => {
    const { store, close, open, receive, lastPlace, ackOf, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const first = lastPlace();
    close();

    expect(pixelAt(1, 2)).toBe(5);
    expect(store.getView().status).toBe("reconnecting");
    open();
    receive(welcome);
    expect(lastPlace()).toEqual(first);
    const ack = ackOf(first);
    receive(ack);
    expect(await placing).toEqual({ ok: true, value: ack });
  });
});

describe("la pose confirmée par l'ack", () => {
  const listenToConfirmed = (store: ReturnType<typeof setup>["store"]) => {
    const heard: (readonly ConfirmedPixel[])[] = [];
    const stop = store.listenConfirmed((pixels) => heard.push(pixels));
    return { heard, stop };
  };

  // Quand l'ack accepte des cases, l'écouteur les reçoit avec la couleur d'avant, sans les refusées
  it("tells the accepted cells of an ack with the color they replace, and leaves the rejected ones out", async () => {
    const { store, receive, lastPlace, ackOf } = setup();
    receive(cellsFrame(2, 2, 9));
    const { heard } = listenToConfirmed(store);

    const placing = store.placeBatch(
      [
        { x: 1, y: 2, colorIndex: 5 },
        { x: 2, y: 2, colorIndex: 6 },
        { x: 3, y: 2, colorIndex: 0 },
      ],
      PLACEMENT_ID,
    );
    expect(heard).toEqual([]);
    receive(ackOf(lastPlace(), [1]));
    await placing;

    expect(heard).toEqual([
      [
        { x: 1, y: 2, colorIndex: 5, previousColorIndex: 0 },
        { x: 3, y: 2, colorIndex: 0, previousColorIndex: 0 },
      ],
    ]);
  });

  // Si le gateway refuse le lot, nommé ou non, aucune case n'est confirmée
  it("tells nothing of a lot the gateway refuses, whether it names the lot or not", async () => {
    const { store, receive, lastPlace } = setup();
    const { heard } = listenToConfirmed(store);

    const refused = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive({ t: "error", code: "rate_limited", requestId: lastPlace().requestId });
    await refused;
    const unauthenticated = store.placeBatch([{ x: 2, y: 2, colorIndex: 6 }], PLACEMENT_ID);
    receive({ t: "error", code: "unauthenticated" });
    await unauthenticated;

    expect(heard).toEqual([]);
  });

  // Une case posée par un autre joueur arrive par une frame cells : elle ne se pose pas en douceur
  it("tells nothing of the cells other players place", () => {
    const { store, receive } = setup();
    const { heard } = listenToConfirmed(store);

    receive(cellsFrame(1, 2, 5));

    expect(heard).toEqual([]);
  });

  // Quand l'écouteur se retire, il n'entend plus rien
  it("stops telling a listener that left", async () => {
    const { store, receive, lastPlace, ackOf } = setup();
    const { heard, stop } = listenToConfirmed(store);
    stop();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive(ackOf(lastPlace()));
    await placing;

    expect(heard).toEqual([]);
  });

  // Tant que le lot est en vol, la couleur confirmée est celle d'avant, alors que `pixels` porte la pose optimiste
  it("keeps the previous color confirmed while the lot is in flight, and takes the placed one on the ack", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();
    receive(cellsFrame(1, 2, 9));

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    expect(pixelAt(1, 2)).toBe(5);
    expect(store.confirmedColorIndexAt(1, 2)).toBe(9);
    expect(store.confirmedColorIndexAt(2, 2)).toBe(0);

    receive(ackOf(lastPlace()));
    await placing;

    expect(store.confirmedColorIndexAt(1, 2)).toBe(5);
  });

  // Si le gateway refuse le lot, la couleur confirmée reste celle d'avant, comme `pixels`
  it("keeps the previous color when the lot is refused", async () => {
    const { store, receive, lastPlace, pixelAt } = setup();
    receive(cellsFrame(1, 2, 9));

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive({ t: "error", code: "rate_limited", requestId: lastPlace().requestId });
    await placing;

    expect(store.confirmedColorIndexAt(1, 2)).toBe(9);
    expect(pixelAt(1, 2)).toBe(9);
  });

  // Une frame cells passée pendant le vol fait foi, comme pour un refus
  it("lets a cells frame that came in during the flight have the last word", () => {
    const { store, receive } = setup();

    void store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    receive(cellsFrame(1, 2, 12));

    expect(store.confirmedColorIndexAt(1, 2)).toBe(12);
  });
});

describe("inspect (CDC 2026, la pill Inspection)", () => {
  const entry = {
    userId: "user-2",
    login: "user2",
    displayName: "User 2",
    colorIndex: 5,
    placedAt: now,
    placementId: "puser2001",
  };

  const lastInspect = (sent: ClientFrame[]) => {
    const frame = sent.at(-1);
    if (frame?.t !== "inspect") throw new Error("aucune frame inspect envoyée");
    return frame;
  };

  // Montre la case inspectée tout de suite, puis son auteur quand la réponse arrive
  it("shows the inspected cell at once, then its author when the answer comes", () => {
    const { store, sent, receive } = setup();

    store.inspect(1, 2);
    expect(store.getView().inspection).toEqual({ status: "loading", x: 1, y: 2 });

    receive({ t: "inspected", requestId: lastInspect(sent).requestId, x: 1, y: 2, entry });
    expect(store.getView().inspection).toEqual({ status: "found", x: 1, y: 2, entry });
  });

  // Dit que personne n'a posé ici quand la réponse n'a pas d'entrée
  it("says nobody placed here when the answer has no entry", () => {
    const { store, sent, receive } = setup();

    store.inspect(0, 0);
    receive({ t: "inspected", requestId: lastInspect(sent).requestId, x: 0, y: 0 });

    expect(store.getView().inspection).toEqual({ status: "empty", x: 0, y: 0 });
  });

  // Ignore la réponse à une inspection plus ancienne
  it("ignores the answer to an older inspection", () => {
    const { store, sent, receive } = setup();
    store.inspect(1, 2);
    const older = lastInspect(sent).requestId;

    store.inspect(3, 3);
    receive({ t: "inspected", requestId: older, x: 1, y: 2, entry });

    expect(store.getView().inspection).toEqual({ status: "loading", x: 3, y: 3 });
  });

  // Ferme l'inspection, et ignore la réponse qui arrive ensuite
  it("closes the inspection, and ignores the answer that comes afterwards", () => {
    const { store, sent, receive } = setup();
    store.inspect(1, 2);

    store.closeInspection();
    receive({ t: "inspected", requestId: lastInspect(sent).requestId, x: 1, y: 2, entry });

    expect(store.getView().inspection).toBeNull();
  });

  // Garde l'inspection d'avant quand le gateway refuse la nouvelle, sans erreur ni lot échoué (écart §4.3, JOURNAL 2026-09-27)
  it("keeps the previous inspection when the gateway refuses the new one, with no error and no failed batch", async () => {
    const { store, sent, receive, pixelAt } = setup();
    store.inspect(1, 2);
    receive({ t: "inspected", requestId: lastInspect(sent).requestId, x: 1, y: 2, entry });
    let isSettled = false;
    void store.placeBatch([{ x: 0, y: 0, colorIndex: 5 }], PLACEMENT_ID).then(() => {
      isSettled = true;
    });

    store.inspect(3, 3);
    receive({ t: "error", code: "rate_limited", requestId: lastInspect(sent).requestId });
    await Promise.resolve();

    expect(store.getView().inspection).toEqual({ status: "found", x: 1, y: 2, entry });
    expect(store.getView().lastError).toBeNull();
    expect(isSettled).toBe(false);
    expect(pixelAt(0, 0)).toBe(5);
  });
});

describe("moderation (§5.4, JOURNAL 2026-09-25)", () => {
  const lastRequestId = (sent: ClientFrame[]): string => {
    const frame = sent.at(-1);
    if (!frame || !("requestId" in frame)) throw new Error("aucune requête envoyée");
    return frame.requestId;
  };

  // Garde le propriétaire du canvas, tiré du welcome : la pill Inspection ne propose rien sur ses pixels
  it("keeps the canvas owner from the welcome", () => {
    const { store } = setup();

    expect(store.getView().ownerId).toBe("owner-1");
  });

  // Prend le rôle que le gateway envoie en direct : nommé modérateur, puis retiré (JOURNAL 2026-09-27)
  it("takes the role the gateway sends live: named moderator, then removed", () => {
    const { store, receive } = setup();

    receive({ t: "role", role: "moderator" });
    expect(store.getView().role).toBe("moderator");

    receive({ t: "role", role: "viewer" });
    expect(store.getView().role).toBe("viewer");
  });

  // Additionne les cases de chaque tranche, et ne se résout qu'à la dernière
  it("adds up the cells of every slice, and resolves only on the last one", async () => {
    const { store, sent, receive } = setup();
    let isSettled = false;
    const moderating = store.moderate({ action: "clearUser", target: "user-2" }).then((result) => {
      isSettled = true;
      return result;
    });
    const requestId = lastRequestId(sent);

    expect(sent.at(-1)).toEqual({
      t: "moderate",
      requestId,
      action: { action: "clearUser", target: "user-2" },
    });
    receive({ t: "moderated", requestId, version: 8, cells: 4096, done: false });
    await Promise.resolve();
    expect(isSettled).toBe(false);

    receive({ t: "moderated", requestId, version: 9, cells: 5, done: true });
    expect(await moderating).toEqual({ ok: true, value: { cells: 4101 } });
  });

  // Rend les pixels d'un auteur, puis la liste des bannis, chacun sur la réponse de sa requête
  it("gives an author's pixels, then the banned users, each on the answer to its own request", async () => {
    const { store, sent, receive } = setup();
    const pixels = [{ x: 1, y: 2, colorIndex: 3 }];
    const users = [
      {
        userId: "user-2",
        login: "user2",
        displayName: "User 2",
        pixelCount: 1,
        isFromTwitch: false,
        hasAccount: true,
      },
    ];

    const listing = store.listPixels("user-2");
    receive({ t: "pixels", requestId: lastRequestId(sent), userId: "user-2", pixels });
    const banning = store.listBans();
    receive({ t: "bans", requestId: lastRequestId(sent), users });

    expect(await listing).toEqual({ ok: true, value: pixels });
    expect(await banning).toEqual({ ok: true, value: users });
  });

  // Rend les modérateurs sur la réponse de sa requête (JOURNAL 2026-09-27)
  it("gives the moderators on the answer to its own request", async () => {
    const { store, sent, receive } = setup();
    const users = [
      {
        userId: "mod-1",
        login: "mod1",
        displayName: "Mod 1",
        isFromTwitch: true,
        isNamedHere: false,
        hasAccount: false,
      },
    ];

    const twitchSync = { status: "revoked", syncedAt: now } as const;

    const listing = store.listModerators();
    receive({ t: "moderators", requestId: lastRequestId(sent), users, twitchSync });

    expect(await listing).toEqual({ ok: true, value: { users, twitchSync } });
  });

  // Nomme un modérateur et rend la liste qui répond (JOURNAL 2026-09-27)
  it("names a moderator and gives back the list that answers", async () => {
    const { store, sent, receive } = setup();

    const naming = store.setModerator("user-2", true);
    const frame = sent.at(-1);
    receive({ t: "moderators", requestId: lastRequestId(sent), users: [] });

    expect(frame).toMatchObject({ t: "setModerator", userId: "user-2", isModerator: true });
    expect(await naming).toEqual({ ok: true, value: { users: [] } });
  });

  // Échoue une modération en cours quand la connexion tombe, ou quand le gateway refuse
  it("fails a pending moderation when the connection drops, or when the gateway refuses", async () => {
    const dropped = setup();
    const refused = setup();

    const dropping = dropped.store.moderate({ action: "ban", target: "user-2" });
    dropped.close();
    const refusing = refused.store.listBans();
    refused.receive({ t: "error", code: "forbidden" });

    expect(await dropping).toEqual({ ok: false, error: "closed" });
    expect(await refusing).toEqual({ ok: false, error: "forbidden" });
  });

  // N'échoue que la requête qu'un forbidden nomme : l'autre requête et le lot en vol attendent, aucun refus n'est montré
  it("fails only the request a forbidden names: another request and a lot in flight keep waiting, no refusal is shown", async () => {
    const { store, sent, receive, lastPlace, ackOf, pixelAt } = setup();
    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const placed = lastPlace();
    const listing = store.listBans();
    const listingId = lastRequestId(sent);
    let isModerationSettled = false;
    const moderating = store.moderate({ action: "ban", target: "user-2" }).then((result) => {
      isModerationSettled = true;
      return result;
    });
    const moderatingId = lastRequestId(sent);

    receive({ t: "error", code: "forbidden", requestId: listingId });

    expect(await listing).toEqual({ ok: false, error: "forbidden" });
    expect(isModerationSettled).toBe(false);
    expect(pixelAt(1, 2)).toBe(5);
    expect(store.getView().lastError).toBeNull();
    const ack = ackOf(placed);
    receive(ack);
    expect(await placing).toEqual({ ok: true, value: ack });
    receive({ t: "moderated", requestId: moderatingId, version: 9, cells: 1, done: true });
    expect(await moderating).toEqual({ ok: true, value: { cells: 1 } });
  });

  // Ne montre aucun refus pour un réglage que le gateway refuse en le nommant, et laisse le lot en vol
  it("shows no refusal for a setting the gateway refuses by name, and leaves a lot in flight", async () => {
    const { store, sent, receive, lastPlace, ackOf } = setup();
    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const placed = lastPlace();

    store.setObsDelay(60_000);
    receive({ t: "error", code: "forbidden", requestId: lastRequestId(sent) });

    expect(store.getView().lastError).toBeNull();
    const ack = ackOf(placed);
    receive(ack);
    expect(await placing).toEqual({ ok: true, value: ack });
  });

  // Passe en banni sur banned, et en sort sur unbanned
  it("turns banned on banned, and back on unbanned", () => {
    const { store, receive } = setup();

    expect(store.getView().isBanned).toBe(false);
    receive({ t: "banned" });
    expect(store.getView().isBanned).toBe(true);
    receive({ t: "unbanned" });
    expect(store.getView().isBanned).toBe(false);
  });

  // Dit à qui écoute quelle liste est périmée, une fois par frame, jusqu'à ce qu'il se retire (JOURNAL 2026-10-06)
  it("tells its listeners which list went stale, until they stop listening", () => {
    const { store, receive } = setup();
    const stale: string[] = [];
    const stop = store.listenStaleLists((list) => stale.push(list));

    receive({ t: "staleList", list: "bans" });
    receive({ t: "staleList", list: "moderators" });
    stop();
    receive({ t: "staleList", list: "bans" });

    expect(stale).toEqual(["bans", "moderators"]);
  });

  // Après une coupure, rien n'a dit ce qui a bougé : les deux listes se relisent à la reprise, pas au premier welcome
  it("calls both lists stale when the page resumes after a drop, and not at its first welcome", () => {
    const { store, receive, close, open } = setup({ isWelcomed: false });
    const stale: string[] = [];
    store.listenStaleLists((list) => stale.push(list));

    receive(welcome);
    expect(stale).toEqual([]);

    close();
    open();
    receive(welcome);

    expect(stale).toEqual(["bans", "moderators"]);
  });
});

describe("the reconnection (§4.5, JOURNAL 2026-09-25)", () => {
  // Dit bonjour à chaque ouverture, avec son mode, et avec sa dernière version une fois accueilli
  it("says hello on every opening, with its mode, and with its last version once welcomed", () => {
    const { sent, receive, close, open } = setup({ storeOptions: { mode: "obs" } });
    const hello = { t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId: "canvas-1", mode: "obs" };

    expect(sent[0]).toEqual(hello);
    receive(cellsFrame(1, 1, 3));
    close();
    open();
    expect(sent.at(-1)).toEqual({ ...hello, lastVersion: 8 });
  });

  // Montre la reprise, garde ses pixels à travers un resync, et revient en direct au welcome
  it("shows the reconnection, keeps its pixels through a resync, and is live again at the welcome", () => {
    const { store, receive, close, open, pixelAt } = setup();
    receive(cellsFrame(1, 2, 4));

    close();
    expect(store.getView().status).toBe("reconnecting");
    open();
    receive({ ...welcome, version: 8 });

    expect(pixelAt(1, 2)).toBe(4);
    expect(store.getView()).toMatchObject({ status: "live", version: 8 });
  });

  // Échoue un lot parti plus de 100 s avant le welcome, sans le renvoyer : son ack n'est plus gardé
  it("fails a batch sent more than 100 s before the welcome, without sending it again", async () => {
    const { store, sent, close, open, receive, clock, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    close();
    clock.nowMs += 101_000;
    open();
    receive(welcome);

    expect(await placing).toEqual({ ok: false, error: "closed" });
    expect(pixelAt(1, 2)).toBe(0);
    expect(sent.filter((frame) => frame.t === "place")).toHaveLength(1);
  });

  // Recharge la page quand une reprise est refusée pour la version du protocole
  it("reloads the page when a reconnection is refused for the protocol version", () => {
    const { receive, close, open, reloads } = setup();

    close();
    open();
    receive({ t: "error", code: "protocol_version" });

    expect(reloads).toEqual(["reload"]);
  });

  // Abandonne sans recharger sur un refus de version au tout premier hello : la page est déjà la dernière
  it("gives up without reloading on a protocol version refusal at the very first hello", () => {
    const { store, receive, reloads, transportState } = setup({ isWelcomed: false });

    receive({ t: "error", code: "protocol_version" });

    expect(reloads).toEqual([]);
    expect(store.getView().status).toBe("closed");
    expect(transportState.isClosed).toBe(true);
  });
});

describe("the OBS delay and the arrivals (§9.5, JOURNAL 2026-09-25)", () => {
  // Prend un nouveau délai OBS, et envoie celui que le streamer choisit
  it("takes a new OBS delay, and sends the one the owner picks", () => {
    const { store, sent, receive } = setup();

    receive({ t: "obsDelay", obsDelayMs: 60_000 });
    store.setObsDelay(300_000);

    expect(store.getView().params?.obsDelayMs).toBe(60_000);
    expect(sent.at(-1)).toEqual({ t: "setObsDelay", requestId: expect.any(String), obsDelayMs: 300_000 });
  });

  // Prend un nouveau fond OBS, et envoie celui que le streamer choisit (JOURNAL 2026-09-29)
  it("takes a new OBS background, and sends the one the owner picks", () => {
    const { store, sent, receive } = setup();

    receive({ t: "obsBackground", obsBackground: "white" });
    store.setObsBackground("transparent");

    expect(store.getView().params?.obsBackground).toBe("white");
    expect(sent.at(-1)).toEqual({
      t: "setObsBackground",
      requestId: expect.any(String),
      obsBackground: "transparent",
    });
  });

  // Prend le thème du welcome, puis celui d'une frame qui le change, puis plus aucun quand la frame n'en porte pas, sans
  // toucher au reste des params (Écart §8.1, JOURNAL 2026-10-07)
  it("takes the theme of the welcome, then a changed one, then none when the frame carries none, leaving the other params alone", () => {
    const { store, receive } = setup({ isWelcomed: false });
    const withoutTheme = { ...welcome, params: { ...welcome.params } };
    if (withoutTheme.t !== "welcome") throw new Error("le welcome d'exemple n'en est pas un");

    receive({ ...withoutTheme, params: { ...withoutTheme.params, theme: "Halloween" } });
    expect(store.getView().params?.theme).toBe("Halloween");

    receive({ t: "theme", theme: "Noël" });
    expect(store.getView().params).toEqual({ ...withoutTheme.params, theme: "Noël" });

    receive({ t: "theme" });
    expect(store.getView().params).toEqual(withoutTheme.params);
    expect(store.getView().params).not.toHaveProperty("theme");
  });

  // Une reconnexion dit le thème du moment : un welcome sans thème retire celui qu'on avait ; une frame arrivée avant le
  // premier welcome n'a rien à changer
  it("lets a reconnection's welcome without a theme drop the one it had, and ignores a frame before the first welcome", () => {
    const { store, receive, close } = setup({ isWelcomed: false });

    receive({ t: "theme", theme: "Trop tôt" });
    expect(store.getView().params).toBeUndefined();

    receive(welcome);
    receive({ t: "theme", theme: "Halloween" });
    close();
    receive(welcome);

    expect(store.getView().params).not.toHaveProperty("theme");
  });

  // Prend de nouvelles bornes et la jauge qui suit, et n'envoie que les deux bornes, jamais tout `params` (JOURNAL 2026-09-30)
  it("takes new limits and the gauge that follows, and sends only the two limits, never the whole params", () => {
    const { store, sent, receive } = setup();

    receive({ t: "gaugeLimits", gaugeMaxStart: 20, gaugeMaxCeiling: 40 });
    receive({ t: "gauge", charges: 5, max: 20, nextRefillAt: 1, claimable: 2 });
    const params = store.getView().params;
    if (params) store.setGaugeLimits({ ...params, gaugeMaxCeiling: 30 });
    store.claimGauge();

    expect(params).toMatchObject({ gaugeMaxStart: 20, gaugeMaxCeiling: 40 });
    expect(store.getView().gauge).toEqual({ charges: 5, max: 20, nextRefillAt: 1, claimable: 2 });
    expect(sent.slice(-2)).toEqual([
      { t: "setGaugeLimits", requestId: expect.any(String), gaugeMaxStart: 20, gaugeMaxCeiling: 30 },
      { t: "claimGauge", requestId: expect.any(String) },
    ]);
  });

  // Transmet chaque arrivée à ses écouteurs : le snapshot avec son recent, puis les cases
  it("hands every arrival to its listeners: the snapshot with its recent, then the cells", () => {
    const { store, receive, snapshot } = setup({ isWelcomed: false });
    const arrivals: Arrival[] = [];
    store.listenArrivals((arrival) => arrivals.push(arrival));
    const recent = { toVersion: 7, cells: [] };
    const state = new Uint8Array(width * 4).fill(2);

    receive({ ...welcome, recent });
    snapshot(state);
    receive(cellsFrame(1, 2, 4));

    expect(arrivals).toEqual([
      { kind: "snapshot", pixels: state, recent },
      {
        kind: "cells",
        frame: {
          toVersion: 8,
          cells: [
            { x: 1, y: 2, colorIndex: 4, previousColorIndex: 0, placedAt: now, version: 8, kind: "place" },
          ],
        },
      },
    ]);
  });
});

describe("reports and hidden placements (JOURNAL 2026-09-28)", () => {
  // Chaque lot porte sa pose
  it("sends each batch with its placement", () => {
    const { store, lastPlace } = setup();

    void store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);

    expect(lastPlace().placementId).toBe(PLACEMENT_ID);
  });

  // `hide` et `unhide` avancent la version et partent vers la vue OBS, sans toucher aux pixels de la page
  it("hide and unhide move the version on and reach the OBS view, without touching the page's pixels", () => {
    const { store, receive, pixelAt } = setup();
    const arrivals: Arrival[] = [];
    store.listenArrivals((arrival) => arrivals.push(arrival));
    receive(cellsFrame(1, 2, 5));

    const obs = { colorIndex: 3, previousColorIndex: 5, placedAt: now - 60_000 };
    const hide = { x: 1, y: 2, colorIndex: 5, previousColorIndex: 5, placedAt: now, obs, version: 9 };
    receive({ t: "cells", toVersion: 9, cells: [{ ...hide, kind: "hide" }] });

    expect(pixelAt(1, 2)).toBe(5);
    expect(store.getView().version).toBe(9);
    expect(arrivals.at(-1)).toEqual({
      kind: "cells",
      frame: { toVersion: 9, cells: [{ ...hide, kind: "hide" }] },
    });
  });

  // Prend le nombre de signalements en attente, et règle un signalement et la liste sur leur réponse
  it("takes the pending report count, and settles a report and the list on their answer", async () => {
    const { store, sent, receive } = setup();
    receive({ t: "reportCount", count: 2 });
    expect(store.getView().reportCount).toBe(2);

    const reporting = store.report(1, 2, "puser2001");
    const reportFrame = sent.at(-1);
    if (reportFrame?.t !== "report") throw new Error("aucune frame report envoyée");
    expect(reportFrame).toMatchObject({ x: 1, y: 2, placementId: "puser2001" });
    receive({ t: "reported", requestId: reportFrame.requestId });
    expect(await reporting).toEqual({ ok: true, value: true });

    const listing = store.listReports();
    const listFrame = sent.at(-1);
    if (listFrame?.t !== "listReports") throw new Error("aucune frame listReports envoyée");
    receive({ t: "reports", requestId: listFrame.requestId, reports: [] });
    expect(await listing).toEqual({ ok: true, value: [] });
  });

  // Signale une plage, et lit les pixels de l'auteur pour la choisir (JOURNAL 2026-09-29)
  it("reports a range, and lists the author's pixels to choose it", async () => {
    const { store, sent, receive } = setup();
    const range = { from: now - 60_000, to: now };

    void store.report(1, 2, "puser2001", range);
    expect(sent.at(-1)).toMatchObject({ t: "report", placementId: "puser2001", range });

    const listing = store.listAuthorPixels(1, 2, "puser2001");
    const listFrame = sent.at(-1);
    if (listFrame?.t !== "listAuthorPixels") throw new Error("aucune frame listAuthorPixels envoyée");
    const pixels = [{ x: 1, y: 2, colorIndex: 5, placedAt: now, placementId: "puser2001" }];
    receive({ t: "authorPixels", requestId: listFrame.requestId, pixels });
    expect(await listing).toEqual({ ok: true, value: pixels });
  });
});

describe("an archive, and the status of a canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  const archivedWelcome: ServerFrame = {
    ...welcome,
    canvas: { canvasId: "canvas-1", width, height: 4, ownerId: "owner-1", archivedAt: now - 1000 },
  };

  // Le welcome dit si le canvas est une archive : la page du jeu et celle d'une archive en décident
  it("takes from the welcome whether the canvas is an archive", () => {
    const active = setup();
    const archive = setup({ isWelcomed: false });
    archive.receive(archivedWelcome);

    expect(active.store.getView()).toMatchObject({ isArchived: false, isDiscarded: false });
    expect(archive.store.getView()).toMatchObject({ isArchived: true, isDiscarded: false, status: "live" });
  });

  // La frame de statut archive le canvas, le rend actif de nouveau, ou le dit supprimé
  it("follows the status frame: archived, active again, or discarded", () => {
    const { store, receive } = setup();

    receive({ t: "canvasStatus", status: "archived" });
    expect(store.getView().isArchived).toBe(true);

    receive({ t: "canvasStatus", status: "active" });
    expect(store.getView()).toMatchObject({ isArchived: false, isDiscarded: false });

    receive({ t: "canvasStatus", status: "discarded" });
    expect(store.getView().isDiscarded).toBe(true);
  });

  // Un welcome redonne ce que le gateway dit du canvas, après une coupure par exemple
  it("takes back what the gateway says at the next welcome", () => {
    const { store, receive } = setup();
    receive({ t: "canvasStatus", status: "archived" });

    receive(welcome);

    expect(store.getView().isArchived).toBe(false);
  });

  // Une écriture refusée parce que le canvas est archivé : la page l'apprend, sans refus affiché ni connexion fermée
  it("learns the canvas is archived from a refused write, with no refusal shown and nothing closed", () => {
    const { store, receive, transportState } = setup();

    receive({ t: "error", code: "canvas_archived", requestId: "request-1" });

    expect(store.getView()).toMatchObject({ isArchived: true, lastError: null, status: "live" });
    expect(transportState.isClosed).toBe(false);
  });

  // Les poses en cours échouent avec ce code, et leurs pixels reprennent leur couleur
  it("fails the batches in flight with that code, giving their pixels their colour back", async () => {
    const { store, receive, lastPlace, pixelAt } = setup();
    const placed = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    const frame = lastPlace();
    expect(pixelAt(1, 2)).toBe(5);

    receive({ t: "error", code: "canvas_archived", requestId: frame.requestId });

    expect(await placed).toEqual({ ok: false, error: "canvas_archived" });
    expect(pixelAt(1, 2)).toBe(0);
  });

  // Les requêtes en attente (liste, signalement) échouent avec ce code aussi
  it("fails the pending requests with that code too", async () => {
    const { store, receive, sent } = setup();
    const listing = store.listBans();
    const frame = sent.at(-1);
    if (frame?.t !== "listBans") throw new Error("aucune frame listBans envoyée");

    receive({ t: "error", code: "canvas_archived", requestId: frame.requestId });

    expect(await listing).toEqual({ ok: false, error: "canvas_archived" });
  });

  // Sans requestId non plus : une erreur du même code vaut pour tout ce qui attend
  it("fails everything that waits on an error of that code without a request id too", async () => {
    const { store, receive, lastPlace } = setup();
    const placed = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }], PLACEMENT_ID);
    lastPlace();

    receive({ t: "error", code: "canvas_archived" });

    expect(await placed).toEqual({ ok: false, error: "canvas_archived" });
    expect(store.getView().isArchived).toBe(true);
  });
});

describe("a store the page closes (Écart §15, JOURNAL 2026-10-06)", () => {
  // La page change de canvas : elle ferme son store, et le socket qui tombe ensuite n'est pas une coupure, rien ne reprendra
  it("announces no reconnection when the socket drops after close(), as nothing will reconnect", () => {
    const { store, close: dropSocket, transportState } = setup();
    const statuses: string[] = [];
    store.subscribe(() => statuses.push(store.getView().status));

    store.close();
    dropSocket();

    expect(transportState.isClosed).toBe(true);
    expect(statuses).not.toContain("reconnecting");
    expect(store.getView().status).not.toBe("reconnecting");
  });

  // Ce qui attendait une réponse échoue quand même : ses promesses se règlent
  it("still fails what waited for an answer when the socket drops after close()", async () => {
    const { store, close: dropSocket } = setup();
    const listing = store.listBans();

    store.close();
    dropSocket();

    expect(await listing).toEqual({ ok: false, error: "closed" });
  });
});

describe("the activity of the developer (écart §4.2, JOURNAL 2026-10-06)", () => {
  const noAudience = {
    visits: 0,
    phoneVisits: 0,
    visitMinutes: 0,
    activeAccounts: 0,
    activePlayers: 0,
    activeStreamers: 0,
  };
  const activity: ServerFrame = {
    t: "activity",
    now: { people: 1, guests: 0, streamed: 0, pixels: 0, signups: 0 },
    audience: { today: noAudience, month: noAudience },
    canvases: [],
  };

  // Dit au gateway de commencer ou d'arrêter, et le redit à chaque reprise tant qu'il regarde
  it("tells the gateway to start or stop, and says it again at each resumption while watching", () => {
    const { store, sent, receive, close, open } = setup();
    const watching = () => sent.filter((frame) => frame.t === "watchActivity");

    store.watchActivity(true);
    close();
    open();
    receive(welcome);
    expect(watching()).toEqual([
      { t: "watchActivity", isWatching: true },
      { t: "watchActivity", isWatching: true },
    ]);

    store.watchActivity(false);
    close();
    open();
    receive(welcome);
    expect(watching()).toHaveLength(3);
    expect(watching().at(-1)).toEqual({ t: "watchActivity", isWatching: false });
  });

  // Rend l'historique de la période demandée, réglé par la réponse de sa requête, ou la coupure
  it("gives the history of the asked period, settled by the answer of its request, or the drop", async () => {
    const { store, sent, receive, close } = setup();
    const point = {
      at: 60_000,
      people: 2,
      streamed: 1,
      pixels: 30,
      signups: 0,
      visits: 0,
      phoneVisits: 0,
      visitMinutes: 0,
    };

    const listed = store.listActivityHistory("month");
    const asked = sent.at(-1);
    if (asked?.t !== "listActivityHistory") throw new Error("aucune frame listActivityHistory");
    receive({ t: "activityHistory", requestId: asked.requestId, points: [point] });
    const dropped = store.listActivityHistory("day");
    close();

    expect(asked.period).toBe("month");
    expect(await listed).toEqual({ ok: true, value: { points: [point] } });
    expect(await dropped).toEqual({ ok: false, error: "closed" });
  });

  // Rend avec l'historique les points du canvas de la socket quand le gateway les envoie (JOURNAL 2026-10-07)
  it("gives with the history the points of the socket's canvas when the gateway sends them", async () => {
    const { store, sent, receive } = setup();
    const canvasPoint = {
      at: 60_000,
      people: 1,
      streamedMinutes: 0,
      pixels: 4,
      visits: 1,
      visitMinutes: 2,
      signups: 0,
    };

    const listed = store.listActivityHistory("day");
    const asked = sent.at(-1);
    if (asked?.t !== "listActivityHistory") throw new Error("aucune frame listActivityHistory");
    receive({ t: "activityHistory", requestId: asked.requestId, points: [], canvasPoints: [canvasPoint] });

    expect(await listed).toEqual({ ok: true, value: { points: [], canvasPoints: [canvasPoint] } });
  });

  // Donne chaque frame activity à qui écoute, jusqu'à ce qu'il se retire
  it("hands each activity frame to its listeners, until they stop listening", () => {
    const { store, receive } = setup();
    const heard: ServerFrame[] = [];
    const stop = store.listenActivity((frame) => heard.push(frame));

    receive(activity);
    stop();
    receive(activity);

    expect(heard).toEqual([activity]);
  });
});

describe("the capacity of the developer (écart §4.2, JOURNAL 2026-10-07)", () => {
  const capacity: ServerFrame = {
    t: "capacity",
    saturation: { percent: 62.1, resource: "redisMemory", isIncomplete: false },
    resources: [],
  };

  // Dit au gateway de commencer ou d'arrêter, et le redit à chaque reprise tant qu'il regarde
  it("tells the gateway to start or stop, and says it again at each resumption while watching", () => {
    const { store, sent, receive, close, open } = setup();
    const watching = () => sent.filter((frame) => frame.t === "watchCapacity");

    store.watchCapacity(true);
    close();
    open();
    receive(welcome);
    expect(watching()).toEqual([
      { t: "watchCapacity", isWatching: true },
      { t: "watchCapacity", isWatching: true },
    ]);

    store.watchCapacity(false);
    close();
    open();
    receive(welcome);
    expect(watching()).toHaveLength(3);
    expect(watching().at(-1)).toEqual({ t: "watchCapacity", isWatching: false });
  });

  // Rend l'historique de la période demandée, réglé par la réponse de sa requête, ou la coupure
  it("gives the history of the asked period, settled by the answer of its request, or the drop", async () => {
    const { store, sent, receive, close } = setup();
    const point = { at: 60_000, saturation: 62.1, resource: "redisMemory", redis: 62.1 } as const;

    const listed = store.listCapacityHistory("month");
    const asked = sent.at(-1);
    if (asked?.t !== "listCapacityHistory") throw new Error("aucune frame listCapacityHistory");
    receive({ t: "capacityHistory", requestId: asked.requestId, points: [point] });
    const dropped = store.listCapacityHistory("day");
    close();

    expect(asked.period).toBe("month");
    expect(await listed).toEqual({ ok: true, value: { points: [point] } });
    expect(await dropped).toEqual({ ok: false, error: "closed" });
  });

  // Donne chaque frame capacity à qui écoute, jusqu'à ce qu'il se retire
  it("hands each capacity frame to its listeners, until they stop listening", () => {
    const { store, receive } = setup();
    const heard: ServerFrame[] = [];
    const stop = store.listenCapacity((frame) => heard.push(frame));

    receive(capacity);
    stop();
    receive(capacity);

    expect(heard).toEqual([capacity]);
  });
});

describe("the scoreboard in the canvas view (JOURNAL 2026-10-06)", () => {
  const top = [
    { login: "ada", displayName: "Ada", pixels: 9 },
    { login: "bob", displayName: "Bob", pixels: 4 },
  ];

  // N'a pas de classement avant sa première frame
  it("has no scoreboard before its first frame", () => {
    const { store } = setup();

    expect(store.getView().scoreboard).toBeUndefined();
  });

  // Prend le classement de chaque frame tel quel, sa place comprise, et le remplace en entier
  it("takes the scoreboard of each frame as it is, its place included, and replaces it whole", () => {
    const { store, receive } = setup();

    receive({ t: "scoreboard", top, you: { rank: 7, pixels: 2 } });
    expect(store.getView().scoreboard).toEqual({ top, you: { rank: 7, pixels: 2 } });

    receive({ t: "scoreboard", top: top.slice(0, 1) });
    expect(store.getView().scoreboard).toEqual({ top: top.slice(0, 1) });
  });

  // Efface le classement à la coupure, et le garde quand d'autres frames passent
  it("clears the scoreboard when the connection drops, and keeps it through other frames", () => {
    const { store, receive, close } = setup();
    receive({ t: "scoreboard", top });

    receive({ t: "gauge", ...gauge });
    expect(store.getView().scoreboard).toEqual({ top });

    close();
    expect(store.getView().scoreboard).toBeUndefined();
  });
});

describe("the Twitch live in the canvas view (Écart §4, JOURNAL 2026-10-07)", () => {
  const art = { category: "Art" };
  const chatting = { category: "Just Chatting" };
  const welcomeWith = (
    ownerTwitchLive?: typeof art,
    twitchLive?: typeof art,
  ): Extract<ServerFrame, { t: "welcome" }> => ({
    t: "welcome",
    canvas: {
      canvasId: "canvas-1",
      width,
      height: 4,
      ownerId: "owner-1",
      ...(ownerTwitchLive ? { ownerTwitchLive } : {}),
    },
    params: {
      gaugeMaxStart: 10,
      gaugeMaxCeiling: 150,
      refillMs: 10_000,
      refillCharges: 1,
      obsDelayMs: 5000,
      obsBackground: "transparent",
    },
    palette: [...PALETTE],
    version: 7,
    you: {
      userId: "user-1",
      login: "user1",
      displayName: "User 1",
      role: "viewer",
      ...(twitchLive ? { twitchLive } : {}),
    },
    gauge,
  });

  // Prend du welcome le live du streamer et celui de la personne connectée, avec leur catégorie
  it("takes from the welcome the live of the owner and of whoever is signed in, with their category", () => {
    const { store, receive } = setup({ isWelcomed: false });

    receive(welcomeWith(art, chatting));

    expect(store.getView().ownerTwitchLive).toEqual(art);
    expect(store.getView().twitchLive).toEqual(chatting);
  });

  // Sans live dans le welcome, personne n'est en live ; un nouveau welcome efface ce que l'ancien disait
  it("has nobody live when the welcome says none, and a new welcome clears what the old one said", () => {
    const { store, receive } = setup({ isWelcomed: false });
    receive(welcomeWith(art, chatting));

    receive(welcomeWith());

    expect(store.getView().ownerTwitchLive).toBeUndefined();
    expect(store.getView().twitchLive).toBeUndefined();
  });

  // Suit le live annoncé : le streamer d'abord, la personne ensuite, par l'identifiant de la frame
  it("follows an announced live, the owner's then the person's, by the id of the frame", () => {
    const { store, receive } = setup({ isWelcomed: false });
    receive(welcomeWith());

    receive({ t: "twitchLive", userId: "owner-1", twitchLive: art });
    expect(store.getView().ownerTwitchLive).toEqual(art);
    expect(store.getView().twitchLive).toBeUndefined();

    receive({ t: "twitchLive", userId: "user-1", twitchLive: chatting });
    expect(store.getView().twitchLive).toEqual(chatting);
    expect(store.getView().ownerTwitchLive).toEqual(art);

    receive({ t: "twitchLive", userId: "owner-1", twitchLive: chatting });
    expect(store.getView().ownerTwitchLive).toEqual(chatting);
  });

  // Efface le live sur une frame sans live, et ignore un compte qui n'est ni le streamer ni la personne
  it("clears a live on a frame without one, and ignores an account that is neither the owner nor the person", () => {
    const { store, receive } = setup({ isWelcomed: false });
    receive(welcomeWith(art, chatting));

    receive({ t: "twitchLive", userId: "user-9", twitchLive: { category: "Music" } });
    expect(store.getView().ownerTwitchLive).toEqual(art);
    expect(store.getView().twitchLive).toEqual(chatting);

    receive({ t: "twitchLive", userId: "owner-1" });
    expect(store.getView().ownerTwitchLive).toBeUndefined();
    expect(store.getView().twitchLive).toEqual(chatting);
  });

  // Quand le streamer est la personne connectée, un seul live le dit aux deux
  it("tells both when the owner is the person signed in", () => {
    const { store, receive } = setup({ isWelcomed: false });
    receive({
      ...welcomeWith(),
      you: { userId: "owner-1", login: "owner1", displayName: "Owner 1", role: "owner" },
    });

    receive({ t: "twitchLive", userId: "owner-1", twitchLive: art });

    expect(store.getView().ownerTwitchLive).toEqual(art);
    expect(store.getView().twitchLive).toEqual(art);
  });

  // Garde le live de l'auteur dans l'inspection
  it("keeps the author's live in the inspection", () => {
    const { store, sent, receive } = setup();
    store.inspect(1, 2);
    const requestId = sent.flatMap((frame) => (frame.t === "inspect" ? [frame.requestId] : [])).at(-1) ?? "";
    const author = {
      login: "user2",
      displayName: "User 2",
      colorIndex: 5,
      placedAt: now,
      placementId: "puser2001",
      twitchLive: art,
    };

    receive({ t: "inspected", requestId, x: 1, y: 2, entry: author });

    expect(store.getView().inspection).toEqual({ status: "found", x: 1, y: 2, entry: author });
  });
});

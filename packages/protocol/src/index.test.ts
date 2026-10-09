import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeClientFrame, decodeServerFrame, PROTOCOL_VERSION } from "./index";

describe("protocol frames", () => {
  it("decodes a valid hello frame", () => {
    const raw = {
      t: "hello",
      protocolVersion: PROTOCOL_VERSION,
      canvasId: "abc123",
      mode: "ui",
    };

    const result = decodeClientFrame(raw);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.t).toBe("hello");
  });

  it("rejects a hello frame with the wrong protocolVersion", () => {
    const raw = {
      t: "hello",
      protocolVersion: PROTOCOL_VERSION - 1,
      canvasId: "abc123",
      mode: "ui",
    };

    const result = decodeClientFrame(raw);

    expect(result.ok).toBe(false);
  });

  it("decodes a place frame with multiple pixels", () => {
    const raw = {
      t: "place",
      requestId: "req-1",
      placementId: "p1a2b3c4d5e6f7a8",
      pixels: [
        { x: 0, y: 0, colorIndex: 5 },
        { x: 10, y: 20, colorIndex: 0 },
        { x: 15, y: 3, colorIndex: 7 },
      ],
    };

    const result = decodeClientFrame(raw);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.t === "place") expect(result.value.pixels.length).toBe(3);
  });

  // Garde la photo Twitch de `you` dans un welcome, et accepte un welcome sans elle (écart §4.3, JOURNAL 2026-09-24)
  it("keeps the Twitch photo of `you` in a welcome, and accepts a welcome without one", () => {
    const welcome = {
      t: "welcome",
      canvas: { canvasId: "abc123", width: 4, height: 4, ownerId: "owner-1" },
      params: {
        gaugeMaxStart: 10,
        gaugeMaxCeiling: 150,
        refillMs: 10_000,
        refillCharges: 1,
        obsDelayMs: 5000,
        obsBackground: "transparent",
      },
      palette: ["#00000000"],
      version: 0,
      you: { userId: "1234", login: "fenysk", displayName: "Fenysk", role: "viewer" },
    };
    const avatarUrl = "https://static-cdn.jtvnw.net/jtv_user_pictures/fenysk-profile_image-300x300.png";

    const withPhoto = decodeServerFrame({ ...welcome, you: { ...welcome.you, avatarUrl } });
    const withoutPhoto = decodeServerFrame(welcome);

    expect(withPhoto.ok && withPhoto.value.t === "welcome" && withPhoto.value.you.avatarUrl).toBe(avatarUrl);
    expect(withoutPhoto.ok).toBe(true);
  });

  // Accepte un cran du délai OBS, et refuse toute autre valeur (écart CDC v3 §1, JOURNAL 2026-09-25)
  it("accepts an OBS delay step, and refuses any other value", () => {
    const setObsDelay = (obsDelayMs: number) =>
      decodeClientFrame({ t: "setObsDelay", requestId: "r-1", obsDelayMs });

    expect(setObsDelay(10_000).ok).toBe(true);
    expect(setObsDelay(0).ok).toBe(true);
    expect(setObsDelay(7_000).ok).toBe(false);
    expect(decodeServerFrame({ t: "obsDelay", obsDelayMs: 60_000 }).ok).toBe(true);
  });

  // Accepte le rôle envoyé en direct, et rien d'autre qu'un rôle (JOURNAL 2026-09-27)
  it("accepts a role sent live, and nothing but a role", () => {
    expect(decodeServerFrame({ t: "role", role: "moderator" })).toEqual({
      ok: true,
      value: { t: "role", role: "moderator" },
    });
    expect(decodeServerFrame({ t: "role", role: "admin" }).ok).toBe(false);
  });

  // Accepte la liste périmée de qui modère, bannis ou modérateurs, et aucune autre (écart §4.3, JOURNAL 2026-10-06)
  it("accepts a stale list for the banned users or the moderators, and no other list", () => {
    expect(decodeServerFrame({ t: "staleList", list: "bans" })).toEqual({
      ok: true,
      value: { t: "staleList", list: "bans" },
    });
    expect(decodeServerFrame({ t: "staleList", list: "moderators" }).ok).toBe(true);
    expect(decodeServerFrame({ t: "staleList", list: "reports" }).ok).toBe(false);
    expect(decodeServerFrame({ t: "staleList" }).ok).toBe(false);
  });

  // Accepte le classement du canvas avec la place de qui regarde, ou sans elle, et un top vide (écart §4.3, JOURNAL 2026-10-06)
  it("accepts the scoreboard with the place of whoever watches, or without it, and an empty top", () => {
    const top = [
      {
        login: "kalyss",
        displayName: "Kalyss",
        avatarUrl: "https://static-cdn.jtvnw.net/k.png",
        pixels: 1204,
      },
      { login: "pixelmoth", displayName: "pixelmoth", pixels: 3 },
    ];
    const withPlace = { t: "scoreboard", top, you: { rank: 7, pixels: 2 } };

    expect(decodeServerFrame(withPlace)).toEqual({ ok: true, value: withPlace });
    expect(decodeServerFrame({ t: "scoreboard", top })).toEqual({
      ok: true,
      value: { t: "scoreboard", top },
    });
    expect(decodeServerFrame({ t: "scoreboard", top: [] }).ok).toBe(true);
  });

  // Refuse un top de plus de cinq lignes, une place sans rang ni pixel, et un classement sans top
  it("refuses a top of more than five rows, a place without a rank or a pixel, and a scoreboard without a top", () => {
    const row = (pixels: number) => ({ login: "a", displayName: "A", pixels });

    expect(decodeServerFrame({ t: "scoreboard", top: Array.from({ length: 6 }, () => row(1)) }).ok).toBe(
      false,
    );
    expect(decodeServerFrame({ t: "scoreboard", top: [row(0)] }).ok).toBe(false);
    expect(decodeServerFrame({ t: "scoreboard", top: [], you: { rank: 0, pixels: 1 } }).ok).toBe(false);
    expect(decodeServerFrame({ t: "scoreboard", top: [], you: { rank: 1, pixels: 0 } }).ok).toBe(false);
    expect(decodeServerFrame({ t: "scoreboard" }).ok).toBe(false);
  });

  // Ne laisse jamais passer l'identifiant d'un joueur du top : le décodage l'écarte
  it("never lets the id of a player of the top through", () => {
    const decoded = decodeServerFrame({
      t: "scoreboard",
      top: [{ userId: "42", login: "kalyss", displayName: "Kalyss", pixels: 5 }],
    });

    expect(decoded).toEqual({
      ok: true,
      value: { t: "scoreboard", top: [{ login: "kalyss", displayName: "Kalyss", pixels: 5 }] },
    });
  });

  // Refuse une page du protocole 11 à 16 : elle se recharge pour reprendre le protocole du moment, 16 depuis le thème du
  // canvas, 17 depuis le live Twitch (écart §4.3, JOURNAL 2026-10-07)
  it("refuses a page of protocol 11 to 16, which reloads to take the current protocol", () => {
    const hello = (protocolVersion: number) =>
      decodeClientFrame({ t: "hello", protocolVersion, canvasId: "abc123", mode: "ui" });

    expect(hello(11).ok).toBe(false);
    expect(hello(12).ok).toBe(false);
    expect(hello(13).ok).toBe(false);
    expect(hello(14).ok).toBe(false);
    expect(hello(15).ok).toBe(false);
    expect(hello(16).ok).toBe(false);
    expect(hello(PROTOCOL_VERSION).ok).toBe(true);
  });

  // Accepte un auteur inspecté sans identifiant, et un refus qui nomme sa requête (écart §4.3, JOURNAL 2026-09-27)
  it("accepts an inspected author without its id, and a refusal that names its request", () => {
    const inspected = {
      t: "inspected",
      requestId: "inspect-1",
      x: 1,
      y: 2,
      entry: { login: "fenysk", displayName: "Fenysk", colorIndex: 3, placedAt: 1, placementId: "42" },
    };
    const refused = { t: "error", code: "rate_limited", requestId: "inspect-2" };

    expect(decodeServerFrame(inspected)).toEqual({ ok: true, value: inspected });
    expect(decodeServerFrame(refused)).toEqual({ ok: true, value: refused });
  });

  // Protocole 6 (JOURNAL 2026-09-28) : une pose tirée par la page commence par une lettre ; une version sert de pose
  // à un pixel plus ancien, qu'on signale ou retire, mais jamais qu'on pose
  it("takes a page-drawn placement to place, and a version as placement only to report or clear", () => {
    const place = (placementId: string) =>
      decodeClientFrame({ t: "place", requestId: "r", placementId, pixels: [{ x: 0, y: 0, colorIndex: 1 }] });
    const report = (placementId: string) =>
      decodeClientFrame({ t: "report", requestId: "r", x: 0, y: 0, placementId });

    expect(place("p1a2b3c4d5e6f7a8").ok).toBe(true);
    expect(place("42").ok).toBe(false);
    expect(place("p1:2").ok).toBe(false);
    expect(report("42").ok).toBe(true);
    expect(report("p1a2b3c4d5e6f7a8").ok).toBe(true);
  });

  // Refuse une plage à l'envers, et accepte Rétablir
  it("refuses a range the wrong way round, and accepts approvePlacement", () => {
    const moderate = (action: Record<string, unknown>) =>
      decodeClientFrame({ t: "moderate", requestId: "r", action });
    const clearPlacement = { action: "clearPlacement", target: "troll", placementId: "42" };

    expect(moderate({ ...clearPlacement, range: { from: 10, to: 20 } }).ok).toBe(true);
    expect(moderate({ ...clearPlacement, range: { from: 20, to: 10 } }).ok).toBe(false);
    expect(moderate({ action: "approvePlacement", target: "troll", placementId: "42" }).ok).toBe(true);
  });

  // Une case peut dire ce que voit le stream, et `hide` est un genre de case
  it("lets a cell say what the stream sees, and hide is a kind of cell", () => {
    const cells = {
      t: "cells",
      toVersion: 9,
      cells: [
        {
          x: 1,
          y: 2,
          colorIndex: 5,
          previousColorIndex: 5,
          placedAt: 1,
          obs: { colorIndex: 3, previousColorIndex: 5, placedAt: 0 },
          version: 9,
          kind: "hide",
        },
      ],
    };

    expect(decodeServerFrame(cells)).toEqual({ ok: true, value: cells });
  });

  // Protocole 7 (JOURNAL 2026-09-29) : un signalement porte sa plage, et les pixels de l'auteur arrivent sans son identifiant
  it("carries a range on a report, and the author's pixels without their id", () => {
    const range = { from: 10, to: 20 };
    expect(decodeClientFrame({ t: "report", requestId: "r", x: 0, y: 0, placementId: "42", range }).ok).toBe(
      true,
    );
    expect(
      decodeClientFrame({
        t: "report",
        requestId: "r",
        x: 0,
        y: 0,
        placementId: "42",
        range: { from: 20, to: 10 },
      }).ok,
    ).toBe(false);
    expect(
      decodeClientFrame({ t: "listAuthorPixels", requestId: "r", x: 0, y: 0, placementId: "42" }).ok,
    ).toBe(true);
    const authorPixels = {
      t: "authorPixels",
      requestId: "r",
      pixels: [{ x: 0, y: 0, colorIndex: 4, placedAt: 1, placementId: "42" }],
    };
    expect(decodeServerFrame(authorPixels)).toEqual({ ok: true, value: authorPixels });
  });
});

// Protocole 14 : le fond noir de la vue OBS, à côté du transparent et du blanc
describe("protocol 14: the OBS background", () => {
  const params = {
    gaugeMaxStart: 10,
    gaugeMaxCeiling: 150,
    refillMs: 10_000,
    refillCharges: 1,
    obsDelayMs: 5000,
  };
  const welcomeWith = (obsBackground: string) => ({
    t: "welcome",
    canvas: { canvasId: "abc123", width: 4, height: 4, ownerId: "owner-1" },
    params: { ...params, obsBackground },
    palette: ["#00000000"],
    version: 0,
    you: { role: "guest" },
  });

  // Le noir se demande, se confirme et se dit dans le welcome, comme le blanc ; une autre couleur est refusée
  it("asks for black, confirms it and tells it in the welcome like white, and refuses another color", () => {
    for (const obsBackground of ["transparent", "black", "white"]) {
      expect(decodeClientFrame({ t: "setObsBackground", requestId: "r", obsBackground }).ok).toBe(true);
      expect(decodeServerFrame({ t: "obsBackground", obsBackground }).ok).toBe(true);
      expect(decodeServerFrame(welcomeWith(obsBackground)).ok).toBe(true);
    }
    expect(decodeClientFrame({ t: "setObsBackground", requestId: "r", obsBackground: "red" }).ok).toBe(false);
    expect(decodeServerFrame({ t: "obsBackground", obsBackground: "red" }).ok).toBe(false);
    expect(decodeServerFrame(welcomeWith("red")).ok).toBe(false);
  });
});

// Protocole 14 (Écart §15, JOURNAL 2026-10-06) : le welcome dit l'archive, et une frame annonce le statut du canvas
describe("protocol 14: the archive", () => {
  const welcome = {
    t: "welcome",
    canvas: { canvasId: "abc123", width: 4, height: 4, ownerId: "owner-1" },
    params: {
      gaugeMaxStart: 10,
      gaugeMaxCeiling: 150,
      refillMs: 10_000,
      refillCharges: 1,
      obsDelayMs: 5000,
      obsBackground: "transparent",
    },
    palette: ["#00000000"],
    version: 0,
    you: { role: "guest" },
  };

  // Refuse un hello resté au protocole 15, celui de la capacité (JOURNAL 2026-10-07 : le thème passe à 16, le live Twitch à 17)
  it("refuses a hello still on protocol 15", () => {
    const hello = { t: "hello", protocolVersion: 15, canvasId: "abc123", mode: "ui" };

    expect(decodeClientFrame(hello).ok).toBe(false);
    expect(decodeClientFrame({ ...hello, protocolVersion: 16 }).ok).toBe(false);
    expect(decodeClientFrame({ ...hello, protocolVersion: PROTOCOL_VERSION }).ok).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(15);
    expect(PROTOCOL_VERSION).toBe(19);
  });

  // Garde la date d'archivage dans le welcome, et accepte un welcome sans elle
  it("keeps the archive date in a welcome, and accepts a welcome without one", () => {
    const archived = { ...welcome, canvas: { ...welcome.canvas, archivedAt: 1_700_000_000_000 } };

    expect(decodeServerFrame(archived)).toEqual({ ok: true, value: archived });
    expect(decodeServerFrame(welcome)).toEqual({ ok: true, value: welcome });
    expect(decodeServerFrame({ ...welcome, canvas: { ...welcome.canvas, archivedAt: "hier" } }).ok).toBe(
      false,
    );
  });

  // Annonce un canvas archivé, redevenu actif ou supprimé, et rien d'autre qu'un statut
  it("announces a canvas archived, active again or discarded, and nothing but a status", () => {
    for (const status of ["archived", "active", "discarded"])
      expect(decodeServerFrame({ t: "canvasStatus", status })).toEqual({
        ok: true,
        value: { t: "canvasStatus", status },
      });

    expect(decodeServerFrame({ t: "canvasStatus", status: "frozen" }).ok).toBe(false);
    expect(decodeServerFrame({ t: "canvasStatus" }).ok).toBe(false);
  });

  // Nomme l'écriture refusée sur une archive : le code, et sa requête quand elle en a une
  it("names a write refused on an archive: the code, and its request when it has one", () => {
    const refused = { t: "error", code: "canvas_archived", requestId: "place-1" };

    expect(decodeServerFrame(refused)).toEqual({ ok: true, value: refused });
    expect(decodeServerFrame({ t: "error", code: "canvas_archived" }).ok).toBe(true);
  });

  // Nomme un canvas en récupération : le code seul, la page reprend à son `welcome` (JOURNAL 2026-10-08, protocole 18)
  it("names a canvas being recovered, and refuses a hello still on protocol 17", () => {
    const recovering = { t: "error", code: "canvas_recovering" };

    expect(decodeServerFrame(recovering)).toEqual({ ok: true, value: recovering });
    expect(decodeClientFrame({ t: "hello", protocolVersion: 17, canvasId: "abc123", mode: "ui" }).ok).toBe(
      false,
    );
  });
});

// JOURNAL 2026-09-29 (audit de sécurité §4) : une frame du client n'a que les clés de son schéma.
describe("strict client frames", () => {
  const hello = { t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId: "abc123", mode: "ui" };
  const pixel = { x: 0, y: 0, colorIndex: 5 };
  const place = { t: "place", requestId: "r", placementId: "p1a2b3c4d5e6f7a8", pixels: [pixel] };
  const range = { from: 10, to: 20 };
  const clear = { action: "clearPlacement", target: "u1", placementId: "42", range };
  const report = { t: "report", requestId: "r", x: 0, y: 0, placementId: "42", range };

  // Une clé en trop, à n'importe quel niveau, rend la frame invalide
  it("refuses an unknown key at any depth", () => {
    for (const frame of [
      { ...hello, isAdmin: true },
      { ...place, isFree: true },
      { ...place, pixels: [{ ...pixel, owner: "u1" }] },
      { t: "moderate", requestId: "r", action: { ...clear, force: true } },
      { t: "moderate", requestId: "r", action: { ...clear, range: { ...range, all: true } } },
      { ...report, range: { ...range, all: true } },
      { t: "watchActivity", isWatching: true, isAdmin: true },
      { t: "ping", extra: 1 },
    ])
      expect(decodeClientFrame(frame).ok).toBe(false);
  });

  // `__proto__` glissé dans le JSON est une clé comme une autre
  it("refuses __proto__ smuggled in the JSON", () => {
    expect(decodeClientFrame(JSON.parse('{"t":"ping","__proto__":{"isAdmin":true}}')).ok).toBe(false);
    expect(
      decodeClientFrame(
        JSON.parse(
          `{"t":"hello","protocolVersion":${PROTOCOL_VERSION},"canvasId":"c","mode":"ui","__proto__":{}}`,
        ),
      ).ok,
    ).toBe(false);
  });

  // Chaque frame telle que la page l'envoie passe toujours
  it("still accepts every frame the page sends", () => {
    for (const frame of [
      hello,
      { ...hello, mode: "obs", lastVersion: 12 },
      place,
      { t: "inspect", requestId: "r", x: 1, y: 2 },
      { t: "moderate", requestId: "r", action: clear },
      { t: "moderate", requestId: "r", action: { action: "ban", target: "u1" } },
      {
        t: "moderate",
        requestId: "r",
        action: { action: "approvePlacement", target: "u1", placementId: "42" },
      },
      { t: "listPixels", requestId: "r", userId: "u1" },
      { t: "listBans", requestId: "r" },
      { t: "listModerators", requestId: "r" },
      { t: "setModerator", requestId: "r", userId: "u1", isModerator: true },
      { t: "setObsDelay", requestId: "r", obsDelayMs: 10_000 },
      { t: "setObsBackground", requestId: "r", obsBackground: "white" },
      { t: "setObsBackground", requestId: "r", obsBackground: "black" },
      report,
      { t: "listAuthorPixels", requestId: "r", x: 0, y: 0, placementId: "42" },
      { t: "listReports", requestId: "r" },
      { t: "resizeCanvas", requestId: "r", width: 50, height: 50 },
      { t: "watchActivity", isWatching: true },
      { t: "listActivityHistory", requestId: "r", period: "day" },
      { t: "ping" },
    ])
      expect(decodeClientFrame(frame)).toEqual({ ok: true, value: frame });
  });
});

// Protocole 13 (écart §4.2 et §4.3, JOURNAL 2026-10-06) : le développeur suit l'activité par le WebSocket.
describe("activity frames", () => {
  const account = {
    userId: "68710381",
    login: "fenysk",
    displayName: "Fenysk",
    avatarUrl: "https://avatar",
    role: "owner",
    connectedAt: 1,
    devices: ["desktop", "phone"],
  };
  const audienceDay = {
    visits: 12,
    phoneVisits: 5,
    visitMinutes: 80,
    activeAccounts: 4,
    activePlayers: 2,
    activeStreamers: 1,
  };
  const activity = {
    t: "activity",
    now: { people: 3, guests: 1, streamed: 1, pixels: 40, signups: 2 },
    audience: { today: audienceDay, month: { ...audienceDay, visits: 300 } },
    canvases: [
      {
        canvasId: "c1",
        owner: { userId: "68710381", login: "fenysk", displayName: "Fenysk" },
        isStreamed: true,
        obsViews: 1,
        people: 3,
        guests: 1,
        heat: 120,
        signups: 2,
        accounts: [account],
      },
    ],
  };
  const point = {
    at: 60_000,
    people: 3,
    streamed: 1,
    pixels: 40,
    signups: 0,
    visits: 2,
    phoneVisits: 1,
    visitMinutes: 7,
  };
  const pointBefore = { at: 60_000, people: 3, streamed: 1, pixels: 40, signups: 0 };

  // Passe au protocole 13, après le 12 du classement (le 14 des archives vient ensuite) : une page en 12 se recharge
  it("is protocol 13 or later, after the scoreboard's 12: a page in 12 reloads", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(13);
    expect(decodeClientFrame({ t: "hello", protocolVersion: 12, canvasId: "c1", mode: "ui" }).ok).toBe(false);
  });

  // Accepte de regarder ou de ne plus regarder l'activité, et rien d'autre dans la frame
  it("accepts watching the activity or not, and nothing else in the frame", () => {
    expect(decodeClientFrame({ t: "watchActivity", isWatching: false }).ok).toBe(true);
    expect(decodeClientFrame({ t: "watchActivity", isWatching: "yes" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "watchActivity" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "watchActivity", isWatching: true, canvasId: "c1" }).ok).toBe(false);
  });

  // Demande l'historique sur 24 h, 30 jours ou tout, avec sa requête, et aucune autre période
  it("asks the history over a day, a month or all, with its request, and no other period", () => {
    const list = (period: string) => decodeClientFrame({ t: "listActivityHistory", requestId: "r", period });

    expect(list("day").ok).toBe(true);
    expect(list("month").ok).toBe(true);
    expect(list("all").ok).toBe(true);
    expect(list("week").ok).toBe(false);
    expect(decodeClientFrame({ t: "listActivityHistory", period: "day" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "listActivityHistory", requestId: "r", period: "day", x: 1 }).ok).toBe(
      false,
    );
  });

  // Rend les chiffres de l'instant et les canvas avec leurs comptes connectés, sur PC et téléphone
  it("carries the numbers of the moment and the canvases with their connected accounts", () => {
    expect(decodeServerFrame(activity)).toEqual({ ok: true, value: activity });
    const onTablet = { ...activity.canvases[0], accounts: [{ ...account, devices: ["tablet"] }] };
    expect(decodeServerFrame({ ...activity, canvases: [onTablet] }).ok).toBe(false);
    expect(decodeServerFrame({ ...activity, now: { ...activity.now, people: -1 } }).ok).toBe(false);
  });

  // Rend l'historique avec sa requête : des nombres seulement, à leur heure
  it("answers the history with its request: numbers only, at their time", () => {
    const history = { t: "activityHistory", requestId: "r", points: [point] };

    expect(decodeServerFrame(history)).toEqual({ ok: true, value: history });
    expect(decodeServerFrame({ t: "activityHistory", points: [point] }).ok).toBe(false);
    expect(decodeServerFrame({ ...history, points: [{ ...point, pixels: 1.5 }] }).ok).toBe(false);
  });

  // JOURNAL 2026-10-07 : l'audience d'aujourd'hui et des 30 jours, six nombres chacune, jamais un nombre négatif ni à virgule
  it("carries the audience of the day and of the month, six whole numbers each", () => {
    expect(decodeServerFrame(activity)).toEqual({ ok: true, value: activity });
    const { audience, ...withoutAudience } = activity;

    expect(decodeServerFrame(withoutAudience).ok).toBe(false);
    expect(decodeServerFrame({ ...activity, audience: { today: audience.today } }).ok).toBe(false);
    expect(
      decodeServerFrame({ ...activity, audience: { ...audience, month: { ...audienceDay, visits: -1 } } }).ok,
    ).toBe(false);
    expect(
      decodeServerFrame({
        ...activity,
        audience: { ...audience, today: { ...audienceDay, visitMinutes: 1.5 } },
      }).ok,
    ).toBe(false);
  });

  // Rend les visites, les visites au téléphone et le temps passé de chaque point, les comptes, joueurs et streamers actifs en plus
  it("carries the visits, the phone visits and the time spent of each point, and the active counts on top", () => {
    const active = { activeAccounts: 4, activePlayers: 2, activeStreamers: 1 };
    const history = { t: "activityHistory", requestId: "r", points: [{ ...point, ...active }] };

    expect(decodeServerFrame(history)).toEqual({ ok: true, value: history });
    expect(decodeServerFrame({ ...history, points: [{ ...point, visits: -1 }] }).ok).toBe(false);
    expect(decodeServerFrame({ ...history, points: [{ ...point, activePlayers: 0.5 }] }).ok).toBe(false);
  });

  // Lit un point d'avant l'audience avec zéro visite, zéro visite au téléphone et zéro minute, sans comptes actifs inventés
  it("reads a point from before the audience with zero visits, phone visits and minutes", () => {
    const history = { t: "activityHistory", requestId: "r", points: [pointBefore] };

    expect(decodeServerFrame(history)).toEqual({
      ok: true,
      value: { ...history, points: [{ ...pointBefore, visits: 0, phoneVisits: 0, visitMinutes: 0 }] },
    });
  });

  // Une page d'avant ignore les champs nouveaux : ses frames serveur ne sont pas strictes, et les nôtres lisent un champ inconnu
  it("lets a page from before ignore the new fields, and reads a field it does not know", () => {
    const before = z.object({
      t: z.literal("activityHistory"),
      requestId: z.string(),
      points: z.array(
        z.object({
          at: z.number(),
          people: z.number(),
          streamed: z.number(),
          pixels: z.number(),
          signups: z.number(),
        }),
      ),
    });
    const history = { t: "activityHistory", requestId: "r", points: [{ ...point, activeAccounts: 4 }] };

    expect(before.safeParse(history).data?.points).toEqual([pointBefore]);
    expect(decodeServerFrame({ ...activity, later: true }).ok).toBe(true);
    expect(decodeServerFrame({ ...history, points: [{ ...point, later: true }] }).ok).toBe(true);
  });

  // Écart §5.1 (JOURNAL 2026-10-08) : le protocole reste en 17, un seul état « streamé » : ni live dans les chiffres et les points, ni isLive
  it("keeps one streamed state in the numbers of the moment, the canvases and the points, without changing the version", () => {
    const beforeActivity = z.object({
      t: z.literal("activity"),
      now: z.object({ people: z.number(), streamed: z.number() }),
      canvases: z.array(z.object({ canvasId: z.string(), obsViews: z.number() })),
    });

    expect(PROTOCOL_VERSION).toBe(19);
    expect(decodeServerFrame(activity)).toEqual({ ok: true, value: activity });
    expect(beforeActivity.safeParse(activity).data).toEqual({
      t: "activity",
      now: { people: 3, streamed: 1 },
      canvases: [{ canvasId: "c1", obsViews: 1 }],
    });
    const { streamed, ...nowWithoutStreamed } = activity.now;
    expect(decodeServerFrame({ ...activity, now: nowWithoutStreamed }).ok).toBe(false);
    expect(decodeServerFrame({ ...activity, now: { ...activity.now, streamed: 1.5 } }).ok).toBe(false);
    expect(decodeServerFrame({ ...activity, now: { ...activity.now, streamed: -1 } }).ok).toBe(false);
    const { isStreamed, ...canvasWithoutStreamed } = activity.canvases[0] ?? {};
    const streamedAsNumber = activity.canvases.map((canvas) => ({ ...canvas, isStreamed: 1 }));
    expect(decodeServerFrame({ ...activity, canvases: [canvasWithoutStreamed] }).ok).toBe(false);
    expect(decodeServerFrame({ ...activity, canvases: streamedAsNumber }).ok).toBe(false);
    // Les champs d'avant, `live` et `isLive`, ne passent plus : ils sont ignorés, jamais gardés
    const withRetiredFields = {
      ...activity,
      now: { ...activity.now, live: 1 },
      canvases: activity.canvases.map((canvas) => ({ ...canvas, isLive: true })),
    };
    expect(decodeServerFrame(withRetiredFields)).toEqual({ ok: true, value: activity });
    const history = { t: "activityHistory", requestId: "r", points: [point] };
    expect(decodeServerFrame(history)).toEqual({ ok: true, value: history });
    expect(decodeServerFrame({ ...history, points: [{ ...point, live: 1 }] })).toEqual({
      ok: true,
      value: history,
    });
    expect(decodeServerFrame({ ...history, points: [{ ...point, streamed: -1 }] }).ok).toBe(false);
    const { streamed: pointStreamed, ...pointWithoutStreamed } = point;
    expect(decodeServerFrame({ ...history, points: [pointWithoutStreamed] }).ok).toBe(false);
  });
});

// JOURNAL 2026-10-07 : les frames disent aussi le canvas de la socket, sans changer de version.
describe("the canvas of the socket in the activity frames", () => {
  const audience = { visits: 12, phoneVisits: 5, visitMinutes: 80, activePlayers: 2, signups: 1 };
  const here = {
    canvasId: "c1",
    owner: { userId: "68710381", login: "fenysk", displayName: "Fenysk", avatarUrl: "https://avatar" },
    isStreamed: true,
    obsViews: 1,
    people: 3,
    guests: 1,
    heat: 120,
    pixels: 40,
    accounts: [
      {
        userId: "68710381",
        login: "fenysk",
        displayName: "Fenysk",
        role: "owner",
        connectedAt: 1,
        devices: ["desktop"],
      },
    ],
    audience: { today: audience, month: { ...audience, visits: 300 } },
  };
  const day = { visits: 0, phoneVisits: 0, visitMinutes: 0, activeAccounts: 0, activePlayers: 0 };
  const activity = {
    t: "activity",
    now: { people: 3, guests: 1, streamed: 1, pixels: 40, signups: 2 },
    audience: { today: { ...day, activeStreamers: 0 }, month: { ...day, activeStreamers: 0 } },
    canvases: [],
  };
  const canvasPoint = {
    at: 60_000,
    people: 3,
    streamedMinutes: 1,
    pixels: 40,
    visits: 2,
    visitMinutes: 7,
    signups: 1,
  };
  const history = { t: "activityHistory", requestId: "r", points: [] };

  // Ne change aucune frame client : le canvas n'est pas demandé, c'est celui de la socket
  it("changes no client frame: the canvas is not asked for, it is the socket's", () => {
    const list = { t: "listActivityHistory", requestId: "r", period: "day" };

    expect(decodeClientFrame(list).ok).toBe(true);
    expect(decodeClientFrame({ ...list, canvasId: "c1" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "watchActivity", isWatching: true, canvasId: "c1" }).ok).toBe(false);
  });

  // Rend le canvas de la socket : son streamer, les chiffres de l'instant, l'audience et les comptes connectés
  it("carries the canvas of the socket: its owner, the numbers of the moment, the audience and the accounts", () => {
    const frame = { ...activity, here };

    expect(decodeServerFrame(frame)).toEqual({ ok: true, value: frame });
    expect(decodeServerFrame({ ...frame, here: { ...here, pixels: -1 } }).ok).toBe(false);
    expect(decodeServerFrame({ ...frame, here: { ...here, audience: { today: audience } } }).ok).toBe(false);
    const { signups, ...withoutSignups } = audience;
    expect(
      decodeServerFrame({ ...frame, here: { ...here, audience: { today: withoutSignups, month: audience } } })
        .ok,
    ).toBe(false);
    const { accounts, ...withoutAccounts } = here;
    expect(decodeServerFrame({ ...frame, here: withoutAccounts }).ok).toBe(false);
  });

  // Rend les points du canvas avec les joueurs actifs de Tout en plus, des nombres entiers seulement
  it("carries the points of the canvas, with the active players of All on top, whole numbers only", () => {
    const frame = { ...history, canvasPoints: [canvasPoint, { ...canvasPoint, activePlayers: 4 }] };

    expect(decodeServerFrame(frame)).toEqual({ ok: true, value: frame });
    expect(decodeServerFrame({ ...frame, canvasPoints: [{ ...canvasPoint, people: 1.5 }] }).ok).toBe(false);
    expect(decodeServerFrame({ ...frame, canvasPoints: [{ ...canvasPoint, signups: -1 }] }).ok).toBe(false);
    const { visits, ...withoutVisits } = canvasPoint;
    expect(decodeServerFrame({ ...frame, canvasPoints: [withoutVisits] }).ok).toBe(false);
    // Écart §5.1 (JOURNAL 2026-10-08) : les minutes streamées, un nombre entier comme le reste
    expect(decodeServerFrame({ ...frame, canvasPoints: [{ ...canvasPoint, streamedMinutes: 0.5 }] }).ok).toBe(
      false,
    );
    const { streamedMinutes, ...withoutStreamedMinutes } = canvasPoint;
    expect(decodeServerFrame({ ...frame, canvasPoints: [withoutStreamedMinutes] }).ok).toBe(false);
    // Le pic des vues OBS, ni `live`, ne sortent plus d'un point : ignorés
    const withRetiredFields = { ...canvasPoint, obsViews: 2, live: 1 };
    expect(decodeServerFrame({ ...history, canvasPoints: [withRetiredFields] })).toEqual({
      ok: true,
      value: { ...history, canvasPoints: [canvasPoint] },
    });
  });

  // Lit une frame sans ces champs, d'un gateway d'avant : pas de canvas, pas de points
  it("reads a frame without these fields, from a gateway from before: no canvas, no points", () => {
    const decodedActivity = decodeServerFrame(activity);
    const decodedHistory = decodeServerFrame(history);

    expect(decodedActivity).toEqual({ ok: true, value: activity });
    expect(decodedHistory).toEqual({ ok: true, value: history });
    expect(decodedActivity.ok && "here" in decodedActivity.value).toBe(false);
    expect(decodedHistory.ok && "canvasPoints" in decodedHistory.value).toBe(false);
  });

  // Une page d'avant ignore le canvas et ses points : ses schémas ne sont pas stricts
  it("lets a page from before ignore the canvas and its points", () => {
    const before = z.object({
      t: z.literal("activityHistory"),
      requestId: z.string(),
      points: z.array(z.object({ at: z.number() })),
    });
    const beforeActivity = z.object({ t: z.literal("activity"), canvases: z.array(z.object({})) });

    expect(before.safeParse({ ...history, canvasPoints: [canvasPoint] }).data).toEqual(history);
    expect(beforeActivity.safeParse({ ...activity, here }).data).toEqual({ t: "activity", canvases: [] });
  });
});

// Protocole 16 (Écart §4.3, JOURNAL 2026-10-07) : le thème du canvas, dans le welcome et dans la frame `theme`
describe("protocol 16: the canvas theme", () => {
  const welcome = {
    t: "welcome",
    canvas: { canvasId: "abc123", width: 4, height: 4, ownerId: "owner-1" },
    params: {
      gaugeMaxStart: 10,
      gaugeMaxCeiling: 150,
      refillMs: 10_000,
      refillCharges: 1,
      obsDelayMs: 5000,
      obsBackground: "transparent",
    },
    palette: ["#00000000"],
    version: 0,
    you: { role: "guest" },
  };
  const withTheme = (theme: unknown) => ({ ...welcome, params: { ...welcome.params, theme } });

  // Refuse un hello resté au protocole 15, celui de la capacité : sa page se recharge (le live Twitch passe ensuite à 17)
  it("refuses a hello still on protocol 15, the capacity's one", () => {
    const hello = { t: "hello", protocolVersion: 15, canvasId: "abc123", mode: "ui" };

    expect(decodeClientFrame(hello).ok).toBe(false);
    expect(decodeClientFrame({ ...hello, protocolVersion: PROTOCOL_VERSION }).ok).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(16);
  });

  // Garde le thème dans les params du welcome, et accepte un welcome sans thème
  it("keeps the theme in the params of a welcome, and accepts a welcome without one", () => {
    expect(decodeServerFrame(withTheme("Halloween"))).toEqual({ ok: true, value: withTheme("Halloween") });
    expect(decodeServerFrame(welcome)).toEqual({ ok: true, value: welcome });
  });

  // Refuse un thème vide ou qui n'est pas du texte, et en accepte un de 40 caractères même en émojis : le domaine les compte par caractère
  it("refuses an empty or non-text theme, and accepts 40 characters even in emoji", () => {
    expect(decodeServerFrame(withTheme("")).ok).toBe(false);
    expect(decodeServerFrame(withTheme(12)).ok).toBe(false);
    expect(decodeServerFrame(withTheme("a".repeat(41))).ok).toBe(false);
    expect(decodeServerFrame(withTheme("a".repeat(40))).ok).toBe(true);
    expect(decodeServerFrame(withTheme("🎨".repeat(40))).ok).toBe(true);
    expect(decodeServerFrame(withTheme("🎨".repeat(41))).ok).toBe(false);
  });

  // Annonce un thème qui change, ou qui disparaît, et rien d'autre qu'un texte
  it("announces a theme that changes or goes away, and nothing but text", () => {
    expect(decodeServerFrame({ t: "theme", theme: "Halloween" })).toEqual({
      ok: true,
      value: { t: "theme", theme: "Halloween" },
    });
    expect(decodeServerFrame({ t: "theme" })).toEqual({ ok: true, value: { t: "theme" } });
    expect(decodeServerFrame({ t: "theme", theme: "" }).ok).toBe(false);
    expect(decodeServerFrame({ t: "theme", theme: 3 }).ok).toBe(false);
    expect(decodeServerFrame({ t: "theme", theme: "a".repeat(41) }).ok).toBe(false);
  });

  // Aucune frame client ne règle le thème : le streamer l'enregistre par la fonction serveur du web
  it("has no client frame to set the theme", () => {
    expect(decodeClientFrame({ t: "setTheme", requestId: "r", theme: "Halloween" }).ok).toBe(false);
  });
});

// Protocole 15 (écart §4.2 et §4.3, JOURNAL 2026-10-07) : le développeur suit la capacité par le WebSocket.
describe("capacity frames", () => {
  const measured = {
    link: "redis",
    id: "redisMemory",
    unit: "bytes",
    state: "measured",
    value: 318_000_000,
    ceiling: 512_000_000,
    ratio: 62.1,
  };
  const monthly = {
    link: "convex",
    id: "convexCalls",
    unit: "calls",
    state: "measured",
    value: 1_550_000,
    ceiling: 1_000_000,
    ratio: 155,
    fullAt: 1_760_000_000_000,
    deployments: ["watchful-spider-409", "dev-deployment"],
  };
  const withoutNews = { link: "web", id: "webUtilization", unit: "percent", state: "withoutNews" };
  const capacity = {
    t: "capacity",
    saturation: { percent: 155, resource: "convexCalls", isIncomplete: false },
    resources: [
      measured,
      withoutNews,
      { link: "convex", id: "convexEgress", unit: "gigabytes", state: "unmeasured" },
      { link: "redis", id: "redisCpu", unit: "cores", state: "measured", value: 0.09, ceiling: 1, ratio: 9 },
      monthly,
    ],
  };
  const point = {
    at: 1_760_000_000_000,
    saturation: 62.1,
    resource: "redisMemory",
    redis: 62.1,
    gateway: 10,
  };
  const history = { t: "capacityHistory", requestId: "r", points: [point] };

  // Regarde la capacité ou non, rien d'autre dans la frame, comme l'activité
  it("accepts watching the capacity or not, and nothing else in the frame", () => {
    expect(decodeClientFrame({ t: "watchCapacity", isWatching: false }).ok).toBe(true);
    expect(decodeClientFrame({ t: "watchCapacity", isWatching: "yes" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "watchCapacity" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "watchCapacity", isWatching: true, canvasId: "c1" }).ok).toBe(false);
  });

  // Demande l'historique d'une des trois périodes, avec sa requête, et rien d'autre
  it("asks for the history of one of the three periods, with its request, and nothing else", () => {
    const list = (period: string) => decodeClientFrame({ t: "listCapacityHistory", requestId: "r", period });

    for (const period of ["day", "month", "all"]) expect(list(period).ok).toBe(true);
    expect(list("week").ok).toBe(false);
    expect(decodeClientFrame({ t: "listCapacityHistory", period: "day" }).ok).toBe(false);
    expect(decodeClientFrame({ t: "listCapacityHistory", requestId: "r", period: "day", x: 1 }).ok).toBe(
      false,
    );
  });

  // Porte la saturation et chaque ressource, mesurée, sans nouvelles ou non mesurée
  it("carries the saturation and each resource, measured, without news or not measured", () => {
    expect(decodeServerFrame(capacity)).toEqual({ ok: true, value: capacity });
  });

  // Protocole 19 : le stock de fichiers de Convex et le retard de la sauvegarde, en secondes, sont des ressources de la frame
  it("carries the Convex file stock and the snapshot delay in seconds, since protocol 19", () => {
    const files = {
      link: "convex",
      id: "convexFiles",
      unit: "bytes",
      state: "measured",
      value: 3e8,
      ceiling: 1.07e9,
      ratio: 28,
    };
    const delay = {
      link: "convex",
      id: "snapshotDelay",
      unit: "seconds",
      state: "measured",
      value: 270,
      ceiling: 900,
      ratio: 30,
    };
    const frame = {
      ...capacity,
      saturation: { ...capacity.saturation, resource: "snapshotDelay" },
      resources: [files, delay],
    };

    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(19);
    expect(decodeServerFrame(frame)).toEqual({ ok: true, value: frame });
    expect(decodeServerFrame({ ...frame, resources: [{ ...delay, unit: "minutes" }] }).ok).toBe(false);
  });

  // Les protections du gateway (JOURNAL 2026-10-09) : deux nombres entiers sur l'heure et sur le jour, facultatifs comme un champ d'un gateway d'avant
  it("carries the guards over the hour and the day as whole numbers, and still accepts a frame without them", () => {
    const guards = {
      hour: { refusedPlacements: 20, closedConnections: 1 },
      day: { refusedPlacements: 140, closedConnections: 3 },
    };

    expect(decodeServerFrame({ ...capacity, guards })).toEqual({ ok: true, value: { ...capacity, guards } });
    expect(decodeServerFrame(capacity).ok).toBe(true);
    for (const wrong of [
      { ...guards, hour: { ...guards.hour, refusedPlacements: -1 } },
      { ...guards, day: { ...guards.day, closedConnections: 1.5 } },
      { ...guards, day: { refusedPlacements: 4 } },
      { hour: guards.hour },
    ])
      expect(decodeServerFrame({ ...capacity, guards: wrong }).ok).toBe(false);
  });

  // Une ressource mesurée a sa valeur, son plafond et son taux ; un état inconnu est refusé
  it("gives a measured resource its value, ceiling and ratio, and refuses an unknown state", () => {
    const { value, ...withoutValue } = measured;
    const { ceiling, ...withoutCeiling } = measured;

    expect(decodeServerFrame({ ...capacity, resources: [withoutValue] }).ok).toBe(false);
    expect(decodeServerFrame({ ...capacity, resources: [withoutCeiling] }).ok).toBe(false);
    expect(decodeServerFrame({ ...capacity, resources: [{ ...measured, ratio: -1 }] }).ok).toBe(false);
    expect(decodeServerFrame({ ...capacity, resources: [{ ...withoutNews, state: "unknown" }] }).ok).toBe(
      false,
    );
  });

  // Refuse un maillon, une ressource ou une unité hors des listes du cahier des charges
  it("refuses a link, a resource or a unit outside the lists of the specification", () => {
    for (const wrong of [{ link: "vps" }, { id: "redisDisk" }, { unit: "megabytes" }])
      expect(decodeServerFrame({ ...capacity, resources: [{ ...measured, ...wrong }] }).ok).toBe(false);
    const unknown = { ...capacity.saturation, resource: "nope" };

    expect(decodeServerFrame({ ...capacity, saturation: unknown }).ok).toBe(false);
  });

  // Dit les déploiements Convex par leur nom, en liste de textes
  it("lists the Convex deployments by name, as a list of texts", () => {
    expect(decodeServerFrame({ ...capacity, resources: [{ ...monthly, deployments: [1] }] }).ok).toBe(false);
    expect(decodeServerFrame({ ...capacity, resources: [{ ...monthly, deployments: "dev" }] }).ok).toBe(
      false,
    );
  });

  // Une saturation sans ressource porteuse reste valide : rien n'est mesuré
  it("accepts a saturation without a carrying resource: nothing is measured", () => {
    const empty = { ...capacity, saturation: { percent: 0, isIncomplete: true }, resources: [] };

    expect(decodeServerFrame(empty)).toEqual({ ok: true, value: empty });
    expect(decodeServerFrame({ ...empty, saturation: { percent: 0 } }).ok).toBe(false);
  });

  // Rend l'historique avec sa requête : des nombres seulement, un taux par maillon quand il y en a un
  it("answers the history with its request: numbers only, a ratio per link when there is one", () => {
    const { saturation, ...withoutSaturation } = point;

    expect(decodeServerFrame(history)).toEqual({ ok: true, value: history });
    expect(decodeServerFrame({ t: "capacityHistory", points: [point] }).ok).toBe(false);
    expect(decodeServerFrame({ ...history, points: [{ ...point, redis: "62" }] }).ok).toBe(false);
    expect(decodeServerFrame({ ...history, points: [{ at: 1, saturation: 0 }] }).ok).toBe(true);
    expect(decodeServerFrame({ ...history, points: [withoutSaturation] }).ok).toBe(false);
  });

  // Une page d'avant ignore les clés qu'elle ne connaît pas : ses schémas ne sont pas stricts
  it("lets a page from before ignore the keys it does not know", () => {
    expect(decodeServerFrame({ ...capacity, later: true }).ok).toBe(true);
    expect(decodeServerFrame({ ...history, points: [{ ...point, later: 1 }] }).ok).toBe(true);
  });
});

// Protocole 17 (écart §4.3, JOURNAL 2026-10-07) : le live Twitch d'un compte, dans le welcome, l'inspected et une frame.
describe("protocol 17: the Twitch live of an account", () => {
  const welcome = {
    t: "welcome",
    canvas: { canvasId: "abc123", width: 4, height: 4, ownerId: "owner-1" },
    params: {
      gaugeMaxStart: 10,
      gaugeMaxCeiling: 150,
      refillMs: 10_000,
      refillCharges: 1,
      obsDelayMs: 5000,
      obsBackground: "transparent",
    },
    palette: ["#00000000"],
    version: 0,
    you: { role: "viewer", userId: "user-1", login: "user1", displayName: "User 1" },
  };
  const inspected = {
    t: "inspected",
    requestId: "inspect-1",
    x: 1,
    y: 2,
    entry: { login: "user2", displayName: "User 2", colorIndex: 3, placedAt: 1, placementId: "puser2001" },
  };

  // Garde le live du streamer et celui de la personne connectée dans le welcome, et accepte un welcome sans eux
  it("keeps the live of the owner and of whoever is signed in in a welcome, and accepts one without", () => {
    const live = {
      ...welcome,
      canvas: { ...welcome.canvas, ownerTwitchLive: { category: "Art" } },
      you: { ...welcome.you, twitchLive: { category: "" } },
    };

    expect(decodeServerFrame(live)).toEqual({ ok: true, value: live });
    expect(decodeServerFrame(welcome)).toEqual({ ok: true, value: welcome });
    expect(
      decodeServerFrame({ ...welcome, canvas: { ...welcome.canvas, ownerTwitchLive: { category: 3 } } }).ok,
    ).toBe(false);
  });

  // Garde le live de l'auteur inspecté, et accepte un auteur hors live
  it("keeps the live of an inspected author, and accepts an author who is not live", () => {
    const live = { ...inspected, entry: { ...inspected.entry, twitchLive: { category: "Just Chatting" } } };

    expect(decodeServerFrame(live)).toEqual({ ok: true, value: live });
    expect(decodeServerFrame(inspected)).toEqual({ ok: true, value: inspected });
    expect(decodeServerFrame({ ...inspected, entry: { ...inspected.entry, twitchLive: {} } }).ok).toBe(false);
  });

  // Porte le live du streamer de chaque canvas de l'activité, jamais celui d'un compte connecté
  it("carries the live of each canvas's owner in the activity, never that of a connected account", () => {
    const day = {
      visits: 1,
      phoneVisits: 0,
      visitMinutes: 2,
      activeAccounts: 1,
      activePlayers: 1,
      activeStreamers: 1,
    };
    const user = { userId: "68710381", login: "fenysk", displayName: "Fenysk" };
    const activity = (owner: object, account: object) => ({
      t: "activity",
      now: { people: 1, guests: 0, streamed: 0, pixels: 0, signups: 0 },
      audience: { today: day, month: day },
      canvases: [
        {
          canvasId: "c1",
          owner,
          isStreamed: false,
          obsViews: 0,
          people: 1,
          guests: 0,
          heat: 0,
          signups: 0,
          accounts: [{ ...user, role: "owner", connectedAt: 1, devices: ["desktop"], ...account }],
        },
      ],
    });
    const live = { category: "Art" };

    const decoded = decodeServerFrame(activity({ ...user, twitchLive: live }, { twitchLive: live }));

    expect(
      decoded.ok && decoded.value.t === "activity" && decoded.value.canvases[0]?.owner.twitchLive,
    ).toEqual(live);
    expect(
      decoded.ok && decoded.value.t === "activity" && decoded.value.canvases[0]?.accounts[0],
    ).not.toHaveProperty("twitchLive");
    expect(decodeServerFrame(activity(user, {})).ok).toBe(true);
    expect(decodeServerFrame(activity({ ...user, twitchLive: { category: 4 } }, {})).ok).toBe(false);
  });

  // Annonce un live qui commence ou change de catégorie, et sa fin par l'absence de live
  it("announces a live that starts or changes category, and its end by the absence of a live", () => {
    const started = { t: "twitchLive", userId: "owner-1", twitchLive: { category: "Art" } };
    const ended = { t: "twitchLive", userId: "owner-1" };

    expect(decodeServerFrame(started)).toEqual({ ok: true, value: started });
    expect(decodeServerFrame(ended)).toEqual({ ok: true, value: ended });
    expect(decodeServerFrame({ t: "twitchLive", twitchLive: { category: "Art" } }).ok).toBe(false);
    expect(decodeServerFrame({ t: "twitchLive", userId: "owner-1", twitchLive: { category: null } }).ok).toBe(
      false,
    );
  });
});

// Écart §4.3 (JOURNAL 2026-10-08) : l'origine d'un modérateur part à tout modérateur, dans l'inspected et les signalements.
describe("the origin of a moderator, for whoever moderates", () => {
  const origin = { isFromTwitch: false, isNamedHere: true };
  const inspected = {
    t: "inspected",
    requestId: "inspect-1",
    x: 1,
    y: 2,
    entry: { login: "user2", displayName: "User 2", colorIndex: 3, placedAt: 1, placementId: "puser2001" },
  };
  const reports = {
    t: "reports",
    requestId: "reports-1",
    reports: [
      {
        userId: "user-2",
        login: "user2",
        displayName: "User 2",
        hasAccount: true,
        placementId: "puser2001",
        reportCount: 2,
        reportedAt: 1,
        isOffStream: true,
        pixels: [{ x: 1, y: 2, colorIndex: 3 }],
      },
    ],
  };
  const reportsWith = (moderatorOrigin: object) => ({
    ...reports,
    reports: reports.reports.map((report) => ({ ...report, moderatorOrigin })),
  });

  // Garde l'origine de l'auteur inspecté et de l'auteur signalé, et accepte l'un et l'autre sans elle
  it("keeps the origin of an inspected author and of a reported one, and accepts both without it", () => {
    const inspectedModerator = { ...inspected, entry: { ...inspected.entry, moderatorOrigin: origin } };

    expect(decodeServerFrame(inspectedModerator)).toEqual({ ok: true, value: inspectedModerator });
    expect(decodeServerFrame(reportsWith(origin))).toEqual({ ok: true, value: reportsWith(origin) });
    expect(decodeServerFrame(inspected)).toEqual({ ok: true, value: inspected });
    expect(decodeServerFrame(reports)).toEqual({ ok: true, value: reports });
    expect(decodeServerFrame(reportsWith({})).ok).toBe(false);
  });
});

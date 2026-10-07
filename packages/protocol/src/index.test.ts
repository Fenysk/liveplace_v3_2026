import { describe, expect, it } from "vitest";
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

  // Refuse une page du protocole 11, 12 ou 13 : elle se recharge pour reprendre le protocole du moment, 14 depuis le
  // canvas archivé (écart §4.3, JOURNAL 2026-10-06)
  it("refuses a page of protocol 11, 12 or 13, which reloads to take the current protocol", () => {
    const hello = (protocolVersion: number) =>
      decodeClientFrame({ t: "hello", protocolVersion, canvasId: "abc123", mode: "ui" });

    expect(hello(11).ok).toBe(false);
    expect(hello(12).ok).toBe(false);
    expect(hello(13).ok).toBe(false);
    expect(hello(14).ok).toBe(true);
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

  // Refuse un hello resté au protocole 13, celui de l'activité
  it("refuses a hello still on protocol 13", () => {
    const hello = { t: "hello", protocolVersion: 13, canvasId: "abc123", mode: "ui" };

    expect(decodeClientFrame(hello).ok).toBe(false);
    expect(decodeClientFrame({ ...hello, protocolVersion: 14 }).ok).toBe(true);
    expect(PROTOCOL_VERSION).toBe(14);
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
  const activity = {
    t: "activity",
    now: { people: 3, guests: 1, streamed: 1, pixels: 40, signups: 2 },
    canvases: [
      {
        canvasId: "c1",
        owner: { userId: "68710381", login: "fenysk", displayName: "Fenysk" },
        obsViews: 1,
        people: 3,
        guests: 1,
        heat: 120,
        signups: 2,
        accounts: [account],
      },
    ],
  };
  const point = { at: 60_000, people: 3, streamed: 1, pixels: 40, signups: 0 };

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
});

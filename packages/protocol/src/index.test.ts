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
        gaugeMax: 10,
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
      report,
      { t: "listAuthorPixels", requestId: "r", x: 0, y: 0, placementId: "42" },
      { t: "listReports", requestId: "r" },
      { t: "resizeCanvas", requestId: "r", width: 50, height: 50 },
      { t: "ping" },
    ])
      expect(decodeClientFrame(frame)).toEqual({ ok: true, value: frame });
  });
});

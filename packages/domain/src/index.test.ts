import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CANVAS_FORMATS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_STRIDE,
  type CellKey,
  canModerate,
  claimableRewards,
  defaultCanvasMeta,
  earnedRewards,
  GAUGE_MAX_CEILING,
  GAUGE_MAX_START,
  type GaugeParams,
  isCanvasSize,
  isGaugeLimits,
  isObsDelayStep,
  OBS_DELAY_MS,
  OBS_DELAY_STEPS_MS,
  PALETTE,
  playerGaugeMax,
  REFILL_CHARGES,
  REFILL_MS,
  refillGauge,
  reportThreshold,
  roleFor,
  type Session,
  type StateOffset,
  TRANSPARENT_COLOR_INDEX,
  toCell,
  toCellKey,
  toParisDay,
  toSession,
  toSessionClaims,
  toStateOffset,
} from "./index";

describe("roleFor (§10.3)", () => {
  const meta = { ownerId: "owner-1" };
  const session = (userId: string): Session => ({ userId, login: userId, displayName: userId });

  // Donne guest sans session, quoi que dise isModerator
  it("gives guest without a session, whatever isModerator says", () => {
    expect(roleFor(null, meta, false)).toBe("guest");
    expect(roleFor(null, meta, true)).toBe("guest");
  });

  // Donne owner au propriétaire du canvas, même s'il est aussi modérateur
  it("gives owner to the canvas owner, even if also a moderator", () => {
    expect(roleFor(session(meta.ownerId), meta, false)).toBe("owner");
    expect(roleFor(session(meta.ownerId), meta, true)).toBe("owner");
  });

  // Donne moderator à un modérateur qui ne possède pas le canvas
  it("gives moderator to a moderator who does not own the canvas", () => {
    expect(roleFor(session("moderator-1"), meta, true)).toBe("moderator");
  });

  // Donne viewer à toute autre personne connectée
  it("gives viewer to anyone else signed in", () => {
    expect(roleFor(session("user-1"), meta, false)).toBe("viewer");
  });
});

describe("canModerate (§5.4)", () => {
  // Laisse modérer le propriétaire et un modérateur, jamais un viewer ni un invité
  it("lets the owner and a moderator moderate, never a viewer nor a guest", () => {
    expect(canModerate("owner")).toBe(true);
    expect(canModerate("moderator")).toBe(true);
    expect(canModerate("viewer")).toBe(false);
    expect(canModerate("guest")).toBe(false);
  });
});

describe("reportThreshold (CDC 2026, Signalement)", () => {
  // 20 % des comptes connectés, arrondi au-dessus, au moins un, sans erreur de flottant
  it("is 20 % of the connected accounts, rounded up, at least one, with no floating-point error", () => {
    expect(reportThreshold(0)).toBe(1);
    expect(reportThreshold(1)).toBe(1);
    expect(reportThreshold(5)).toBe(1);
    expect(reportThreshold(6)).toBe(2);
    expect(reportThreshold(15)).toBe(3);
    expect(reportThreshold(1000)).toBe(200);
  });
});

describe("refillGauge", () => {
  // refillCharges ≠ 1 : un oubli du `× refillCharges` ne passerait pas.
  const params: GaugeParams = { gaugeMax: 10, refillMs: 1000, refillCharges: 3 };
  const start = 1_700_000_000_000;

  // Traiter une jauge manquante comme pleine
  it("treats a missing gauge as full", () => {
    expect(refillGauge(undefined, start, params)).toEqual({ charges: params.gaugeMax, at: start });
  });

  // Ne recharge pas avant la première période
  it("does not refill before the first interval", () => {
    const gauge = { charges: 0, at: start };

    expect(refillGauge(gauge, start + params.refillMs - 1, params)).toEqual(gauge);
  });

  // Recharge un lot de charges par période écoulée
  it("refills one batch of charges per elapsed interval", () => {
    const gauge = { charges: 0, at: start };

    expect(refillGauge(gauge, start + 2 * params.refillMs, params)).toEqual({
      charges: 2 * params.refillCharges,
      at: start + 2 * params.refillMs,
    });
  });

  // Limite les charges à gaugeMax
  it("caps charges at gaugeMax", () => {
    const gauge = { charges: params.gaugeMax - 1, at: start };

    expect(refillGauge(gauge, start + 10 * params.refillMs, params)).toEqual({
      charges: params.gaugeMax,
      at: start + 10 * params.refillMs,
    });
  });

  // Pleine, elle n'avance plus : après une longue pause, la recharge repart de maintenant (JOURNAL 2026-09-29)
  it("stops advancing once full: after a long pause, the refill starts again from now", () => {
    const gauge = { charges: params.gaugeMax - 1, at: start };
    const later = start + 60 * params.refillMs + params.refillMs / 2;

    expect(refillGauge(gauge, later, params)).toEqual({ charges: params.gaugeMax, at: later });
  });

  // Garde le reste d'une période incomplète
  it("keeps the remainder of an unfinished interval", () => {
    const gauge = { charges: 0, at: start };

    expect(refillGauge(gauge, start + params.refillMs + params.refillMs / 2, params)).toEqual({
      charges: params.refillCharges,
      at: start + params.refillMs,
    });
  });

  // Laisse la jauge inchangée lorsque le temps recule
  it("leaves the gauge untouched when the clock goes backwards", () => {
    const gauge = { charges: 1, at: start };

    expect(refillGauge(gauge, start - params.refillMs, params)).toEqual(gauge);
  });
});

describe("cell coordinates (D-15)", () => {
  // y ≥ 1 : sur la ligne 0, cellKey et stateOffset valent tous deux x.
  const x = 3;
  const y = 2;

  // Donne une cellKey différente de l'offset d'état de la même cellule
  it("gives a cellKey different from the stateOffset of the same cell", () => {
    expect(toCellKey(x, y)).not.toBe(toStateOffset(x, y, CANVAS_WIDTH));
  });

  // Déplace l'offset d'état avec la largeur, jamais la cellKey
  it("moves the stateOffset with the width, never the cellKey", () => {
    expect(toStateOffset(x, y, CANVAS_WIDTH)).toBe(y * CANVAS_WIDTH + x);
    expect(toStateOffset(x, y, CANVAS_WIDTH * 2)).toBe(y * CANVAS_WIDTH * 2 + x);
    expect(toCellKey(x, y)).toBe(y * CELL_STRIDE + x);
  });

  // Retrouve la case d'une cellKey, sur la ligne 0 comme ailleurs
  it("finds the cell back from its cellKey, on row 0 as elsewhere", () => {
    expect(toCell(toCellKey(x, y))).toEqual({ x, y });
    expect(toCell(toCellKey(CANVAS_WIDTH - 1, 0))).toEqual({ x: CANVAS_WIDTH - 1, y: 0 });
  });

  // Maintient les deux types d'index distincts
  it("keeps the two index types apart", () => {
    expectTypeOf(toCellKey(x, y)).not.toExtend<StateOffset>();
    expectTypeOf(toStateOffset(x, y, CANVAS_WIDTH)).not.toExtend<CellKey>();
  });
});

describe("palette", () => {
  // S'assure que l'index transparent est complètement transparent
  it("makes the transparent index fully transparent", () => {
    expect(PALETTE[TRANSPARENT_COLOR_INDEX]).toMatch(/^#[0-9a-f]{6}00$/);
  });

  // S'assure que la palette contient uniquement des couleurs hexadécimales, et qu'il y a au plus 256 couleurs (un octet par colorIndex)
  it("holds only hex colors, at most 256 (one byte per colorIndex)", () => {
    for (const color of PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    expect(PALETTE.length).toBeLessThanOrEqual(256);
  });

  // Range les 42 couleurs du CDC 2026 dans son ordre, après le transparent : cet ordre est figé (JOURNAL 2026-09-24)
  it("orders the 42 colors of the 2026 spec after the transparent, an order that never moves", () => {
    const specOrder =
      "#10121c, #2c1e31, #6b2643, #ac2847, #ec273f, #94493a, #de5d3a, #e98537, #f3a833, #4d3533, #6e4c30, #a26d3f, #ce9248, #dab163, #e8d282, #f7f3b7, #1e4044, #006554, #26854c, #5ab552, #9de64e, #008b8b, #62a477, #a6cb96, #d3eed3, #3e3b65, #3859b3, #3388de, #36c5f4, #6dead6, #5e5b8c, #8c78a5, #b0a7b8, #deceed, #9a4d76, #c878af, #cc99ff, #fa6e79, #ffa2ac, #ffd1d5, #f6e8e0, #ffffff";
    expect(PALETTE.slice(TRANSPARENT_COLOR_INDEX + 1)).toEqual(specOrder.split(", "));
  });
});

describe("session claims (§10.2)", () => {
  const session: Session = { userId: "1234", login: "fenysk", displayName: "Fenysk" };

  // Retrouve telle quelle la session que le web a signée
  it("round-trips a session through its claims", () => {
    expect(toSession(toSessionClaims(session))).toEqual(session);
  });

  // Met le Twitch ID dans sub, là où le gateway le lit
  it("puts the Twitch ID in sub", () => {
    expect(toSessionClaims(session).sub).toBe(session.userId);
  });

  // Rend null quand un claim manque ou n'est pas du texte : un invité, jamais une erreur
  it("gives null when a claim is missing or not text", () => {
    expect(toSession({ sub: "1234", login: "fenysk" })).toBeNull();
    expect(toSession({ sub: 1234, login: "fenysk", displayName: "Fenysk" })).toBeNull();
  });

  // Ne met jamais l'e-mail d'un compte dans la session (écart §10.1, JOURNAL 2026-09-27)
  it("never puts an account's email in the session", () => {
    const signedIn = { ...session, avatarUrl: "https://avatar", email: "fenysk@example.com" };
    expect(toSessionClaims(signedIn)).not.toHaveProperty("email");
    expect(toSession({ ...toSessionClaims(signedIn), email: signedIn.email })).not.toHaveProperty("email");
  });

  // Porte la photo Twitch quand la session en a une, et la retrouve (écart §10.2, JOURNAL 2026-09-24)
  it("carries the Twitch photo when the session has one, and reads it back", () => {
    const withPhoto: Session = {
      ...session,
      avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/fenysk-profile_image-300x300.png",
    };
    expect(toSessionClaims(withPhoto).avatarUrl).toBe(withPhoto.avatarUrl);
    expect(toSession(toSessionClaims(withPhoto))).toEqual(withPhoto);
  });

  // Un cookie signé avant la photo reste valide, sans photo ; une photo illisible est ignorée
  it("keeps a cookie signed before the photo valid, and ignores an unreadable photo", () => {
    expect(toSessionClaims(session)).not.toHaveProperty("avatarUrl");
    expect(toSession({ sub: "1234", login: "fenysk", displayName: "Fenysk", avatarUrl: 42 })).toEqual(
      session,
    );
  });
});

describe("defaultCanvasMeta (CDC §1)", () => {
  // Donne au canvas neuf de son propriétaire les valeurs par défaut du jeu
  it("gives the owner's new canvas the game defaults", () => {
    expect(defaultCanvasMeta("owner-1")).toEqual({
      ownerId: "owner-1",
      width: 50,
      height: 50,
      gaugeMaxStart: GAUGE_MAX_START,
      gaugeMaxCeiling: GAUGE_MAX_CEILING,
      refillMs: REFILL_MS,
      refillCharges: REFILL_CHARGES,
      obsDelayMs: OBS_DELAY_MS,
      obsBackground: "transparent",
    });
  });
});

describe("the player's gauge max (JOURNAL 2026-09-30)", () => {
  const limits = { gaugeMaxStart: 10, gaugeMaxCeiling: 150 };

  // Donne le premier +1 au 12e pixel compté, puis suit la racine carrée
  it("earns the first +1 at the 12th counted pixel, then follows the square root", () => {
    expect(earnedRewards(0)).toBe(0);
    expect(earnedRewards(11)).toBe(0);
    expect(earnedRewards(12)).toBe(1);
    expect(earnedRewards(100)).toBe(3);
    expect(earnedRewards(400)).toBe(6);
  });

  // Ajoute les récompenses réclamées à la jauge de départ
  it("adds the claimed rewards to the starting gauge", () => {
    expect(playerGaugeMax(0, limits)).toBe(10);
    expect(playerGaugeMax(4, limits)).toBe(14);
  });

  // Rend réclamables les récompenses gagnées et pas encore réclamées
  it("makes claimable the earned rewards not claimed yet", () => {
    expect(claimableRewards({ countedPixels: 100, claimed: 1 }, limits)).toBe(2);
    expect(claimableRewards({ countedPixels: 100, claimed: 3 }, limits)).toBe(0);
    expect(claimableRewards({ countedPixels: 11, claimed: 0 }, limits)).toBe(0);
  });

  // Ne laisse rien réclamer au-delà du plafond
  it("lets nothing be claimed past the ceiling", () => {
    const low = { gaugeMaxStart: 10, gaugeMaxCeiling: 12 };
    expect(claimableRewards({ countedPixels: 400, claimed: 0 }, low)).toBe(2);
    expect(claimableRewards({ countedPixels: 400, claimed: 2 }, low)).toBe(0);
  });

  // Rabote la jauge sous un plafond baissé, et la rend quand il remonte
  it("trims the gauge under a lowered ceiling, and gives it back when the ceiling rises", () => {
    const claimed = 6;
    expect(playerGaugeMax(claimed, { gaugeMaxStart: 10, gaugeMaxCeiling: 12 })).toBe(12);
    expect(
      claimableRewards({ countedPixels: 900, claimed }, { gaugeMaxStart: 10, gaugeMaxCeiling: 12 }),
    ).toBe(0);
    expect(playerGaugeMax(claimed, limits)).toBe(16);
    expect(claimableRewards({ countedPixels: 900, claimed }, limits)).toBe(3);
  });

  // Change de jour à minuit à Paris, pas à minuit UTC
  it("changes day at midnight in Paris, not at midnight UTC", () => {
    expect(toParisDay(Date.UTC(2026, 9, 4, 21, 59))).toBe("2026-10-04");
    expect(toParisDay(Date.UTC(2026, 9, 4, 22, 0))).toBe("2026-10-05");
    expect(toParisDay(Date.UTC(2026, 11, 31, 23, 0))).toBe("2027-01-01");
  });

  // Accepte un départ de 1 à 50 et un plafond du départ jusqu'à 500
  it("accepts a start from 1 to 50 and a ceiling from the start up to 500", () => {
    expect(isGaugeLimits(limits)).toBe(true);
    expect(isGaugeLimits({ gaugeMaxStart: 1, gaugeMaxCeiling: 1 })).toBe(true);
    expect(isGaugeLimits({ gaugeMaxStart: 50, gaugeMaxCeiling: 500 })).toBe(true);
    expect(isGaugeLimits({ gaugeMaxStart: 0, gaugeMaxCeiling: 150 })).toBe(false);
    expect(isGaugeLimits({ gaugeMaxStart: 51, gaugeMaxCeiling: 150 })).toBe(false);
    expect(isGaugeLimits({ gaugeMaxStart: 20, gaugeMaxCeiling: 19 })).toBe(false);
    expect(isGaugeLimits({ gaugeMaxStart: 10, gaugeMaxCeiling: 501 })).toBe(false);
    expect(isGaugeLimits({ gaugeMaxStart: 10.5, gaugeMaxCeiling: 150 })).toBe(false);
  });
});

describe("the canvas sizes (CDC 2026 §1)", () => {
  // Accepte chaque taille du tableau, et rien d'autre, ni la taille des canvas d'avant les formats
  it("accepts each size of the table, and nothing else, not even the size of canvases born before formats", () => {
    const sizes = CANVAS_FORMATS.flatMap((format) => format.sizes);
    expect(sizes).toHaveLength(15);
    expect(sizes.every(isCanvasSize)).toBe(true);
    expect(isCanvasSize({ width: 100, height: 50 })).toBe(false);
    expect(isCanvasSize({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT })).toBe(false);
    expect(Math.max(...sizes.flatMap(({ width, height }) => [width, height]))).toBe(256);
  });
});

describe("the OBS delay steps (JOURNAL 2026-09-25)", () => {
  // Part de zéro, monte jusqu'à 10 min, et le défaut de 10 s en est un
  it("goes from none up to 10 minutes, the 10 s default being one of them", () => {
    expect(OBS_DELAY_STEPS_MS[0]).toBe(0);
    expect(OBS_DELAY_STEPS_MS.at(-1)).toBe(10 * 60_000);
    expect(OBS_DELAY_MS).toBe(10_000);
    expect(isObsDelayStep(OBS_DELAY_MS)).toBe(true);
  });

  // N'accepte qu'un cran, jamais une valeur entre deux, négative ou au-delà
  it("accepts a step only, never a value in between, negative or beyond", () => {
    expect(OBS_DELAY_STEPS_MS.every(isObsDelayStep)).toBe(true);
    expect(isObsDelayStep(7_000)).toBe(false);
    expect(isObsDelayStep(-5_000)).toBe(false);
    expect(isObsDelayStep(20 * 60_000)).toBe(false);
  });
});

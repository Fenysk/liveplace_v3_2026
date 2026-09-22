import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_STRIDE,
  type CellKey,
  defaultCanvasMeta,
  GAUGE_MAX,
  type GaugeParams,
  OBS_DELAY_MS,
  PALETTE,
  REFILL_CHARGES,
  REFILL_MS,
  refillGauge,
  roleFor,
  type Session,
  type StateOffset,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
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
});

describe("defaultCanvasMeta (CDC §1)", () => {
  // Donne au canvas neuf de son propriétaire les valeurs par défaut du jeu
  it("gives the owner's new canvas the game defaults", () => {
    expect(defaultCanvasMeta("owner-1")).toEqual({
      ownerId: "owner-1",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      gaugeMax: GAUGE_MAX,
      refillMs: REFILL_MS,
      refillCharges: REFILL_CHARGES,
      obsDelayMs: OBS_DELAY_MS,
    });
  });
});

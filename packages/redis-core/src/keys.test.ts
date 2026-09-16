import { type CellKey, toCellKey } from "@liveplace/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { buildCanvasKeys } from "./keys";

describe("buildCanvasKeys (§5.1)", () => {
  const canvasId = "canvas-1";
  const prefix = `cv:${canvasId}:`;
  const keys = buildCanvasKeys(canvasId);
  const names = [
    keys.meta,
    keys.state,
    keys.version,
    keys.events,
    keys.cleared,
    keys.bans,
    keys.mods,
    keys.live,
    keys.hist(toCellKey(3, 2)),
    keys.cells("user-1"),
    keys.gauge("user-1"),
    keys.req("user-1", "request-1"),
  ];

  // Préfixe toutes les clés d'un canvas par `cv:<canvasId>:` : le passage en cluster n'ajoute que des accolades
  it("prefixes every key of a canvas with cv:<canvasId>:", () => {
    for (const name of names) expect(name.slice(0, prefix.length)).toBe(prefix);
  });

  // Donne un nom distinct à chaque clé
  it("gives every key a distinct name", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  // Nomme une pile d'historique par sa cellKey, jamais par un stateOffset (D-15)
  it("names a hist key by cellKey only", () => {
    expectTypeOf(keys.hist).parameter(0).toEqualTypeOf<CellKey>();
  });
});

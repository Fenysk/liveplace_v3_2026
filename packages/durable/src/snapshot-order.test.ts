import { WORKING_KEPT } from "@liveplace/domain/retention";
import { SNAPSHOT_TIERS } from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { snapshotTier } from "../convex/schema";
import { isOutdated, SNAPSHOTS_KEPT } from "./snapshot-order";

describe("isOutdated (Écart §8.1, JOURNAL 2026-10-06)", () => {
  const latest = { version: 100, takenAt: 5_000 };

  // Sans snapshot gardé, rien n'est dépassé
  it("accepts the first snapshot of a canvas", () => {
    expect(isOutdated({ version: 1, takenAt: 1 }, undefined)).toBe(false);
  });

  // Refuse une version plus basse, même plus récente : un Redis revenu en arrière ne remplace pas une sauvegarde avancée
  it("refuses a lower version, even a more recent one", () => {
    expect(isOutdated({ version: 99, takenAt: 9_000 }, latest)).toBe(true);
  });

  // Accepte une version plus haute
  it("accepts a higher version", () => {
    expect(isOutdated({ version: 101, takenAt: 4_000 }, latest)).toBe(false);
  });

  // À version égale, le plus récent gagne : un réglage change le snapshot sans changer la version
  it("lets the most recent win at an equal version", () => {
    expect(isOutdated({ version: 100, takenAt: 5_001 }, latest)).toBe(false);
    expect(isOutdated({ version: 100, takenAt: 5_000 }, latest)).toBe(false);
    expect(isOutdated({ version: 100, takenAt: 4_999 }, latest)).toBe(true);
  });
});

describe("the working tier", () => {
  // Convex ne voit pas `domain` : le worker tient en mémoire autant de sauvegardes de travail que Convex en garde
  it("keeps as many saves in Convex as the worker counts in memory", () => {
    expect(SNAPSHOTS_KEPT).toBe(WORKING_KEPT);
  });
});

describe("the tiers of the snapshots table", () => {
  // Convex ne voit pas `domain` : ses paliers sont recopiés, et rien d'autre ne garde les deux listes ensemble
  it("are the tiers of the domain", () => {
    expect(snapshotTier.members.map((member) => member.value)).toEqual([...SNAPSHOT_TIERS]);
  });
});

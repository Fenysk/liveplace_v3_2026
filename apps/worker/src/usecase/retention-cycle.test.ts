import type { RetentionStore } from "@liveplace/domain/ports";
import { DAILY_FULL_MS, DAILY_KEPT_MS, DAY_MS, type TierRow } from "@liveplace/domain/retention";
import { type CanvasSnapshot, SNAPSHOT_SCHEMA_VERSION, type SnapshotTier } from "@liveplace/domain/snapshot";
import { describe, expect, it } from "vitest";
import { createRetentionCycle } from "./retention-cycle";

const HOUR_MS = 3_600_000;
const NOW = Date.UTC(2026, 9, 8, 12, 30); // jeudi 8 octobre 2026, 12:30 UTC : la semaine du lundi 5 est ouverte
const FULL_SIZE = 100;
const IMAGE_SIZE = 10;

const row = (tier: SnapshotTier, takenAt: number, isStateOnly = false): TierRow => ({
  tier,
  version: 100,
  takenAt,
  isStateOnly,
});

type StoredRow = TierRow & { file: number };

// Convex en mémoire : des lignes qui désignent des fichiers, un fichier qui part avec sa dernière ligne.
function createFakeConvex(initial: Record<string, TierRow[]>) {
  const rows = new Map<string, StoredRow[]>();
  const files = new Map<number, { isStateOnly: boolean; size: number }>();
  const calls: string[] = [];
  let nextFile = 1;
  let failReads = 0;
  let onMutation = (): void => undefined;

  const addFile = (isStateOnly: boolean): number => {
    files.set(nextFile, { isStateOnly, size: isStateOnly ? IMAGE_SIZE : FULL_SIZE });
    return nextFile++;
  };
  for (const [canvasId, tiers] of Object.entries(initial))
    rows.set(
      canvasId,
      tiers.map((tier) => ({ ...tier, file: addFile(tier.isStateOnly) })),
    );

  const find = (canvasId: string, { tier, takenAt }: { tier: SnapshotTier; takenAt: number }) =>
    rows.get(canvasId)?.find((known) => known.tier === tier && known.takenAt === takenAt);
  const release = (file: number): void => {
    if (![...rows.values()].flat().some((known) => known.file === file)) files.delete(file);
  };

  const store: RetentionStore = {
    async listTiers(afterCanvasId, maxCanvases) {
      calls.push("listTiers");
      const ids = [...rows.keys()].sort().filter((canvasId) => canvasId > afterCanvasId);
      const page = ids.slice(0, maxCanvases);
      return {
        canvases: page.map((canvasId) => ({
          canvasId,
          rows: (rows.get(canvasId) ?? []).map(({ file, ...tier }) => tier),
        })),
        next: ids.length > maxCanvases ? (page.at(-1) ?? null) : null,
      };
    },
    async promote(canvasId, from, to) {
      calls.push(`promote ${canvasId} ${from.tier}>${to}`);
      onMutation();
      const source = find(canvasId, from);
      if (!source) return "missing";
      if (find(canvasId, { tier: to, takenAt: from.takenAt })) return "exists";
      rows.get(canvasId)?.push({ ...source, tier: to });
      return "promoted";
    },
    async getFile(canvasId, tier) {
      calls.push(`getFile ${canvasId} ${tier.tier}`);
      if (failReads > 0) {
        failReads -= 1;
        throw new Error("Convex injoignable");
      }
      const source = find(canvasId, tier);
      const file = source && files.get(source.file);
      return file ? { isStateOnly: file.isStateOnly, bytes: new Uint8Array(file.size) } : null;
    },
    async storeStateOnly({ canvasId, tier, version, takenAt }) {
      calls.push(`storeStateOnly ${canvasId} ${tier}`);
      onMutation();
      if (find(canvasId, { tier, takenAt })) return "exists";
      rows.get(canvasId)?.push({ tier, version, takenAt, isStateOnly: true, file: addFile(true) });
      return "stored";
    },
    async degrade(canvasId, tier) {
      calls.push(`degrade ${canvasId} ${tier.tier}`);
      onMutation();
      const source = find(canvasId, tier);
      if (!source) return "missing";
      const previous = source.file;
      source.file = addFile(true);
      source.isStateOnly = true;
      release(previous);
      return "degraded";
    },
    async discard(canvasId, tier) {
      calls.push(`discard ${canvasId} ${tier.tier}`);
      onMutation();
      const source = find(canvasId, tier);
      if (!source) return;
      rows.set(
        canvasId,
        (rows.get(canvasId) ?? []).filter((known) => known !== source),
      );
      release(source.file);
    },
  };

  return {
    store,
    calls,
    tiersOf: (canvasId: string) =>
      (rows.get(canvasId) ?? []).map(({ tier, takenAt, isStateOnly }) => ({ tier, takenAt, isStateOnly })),
    fileOf: (canvasId: string, tier: SnapshotTier, takenAt: number) =>
      find(canvasId, { tier, takenAt })?.file,
    // Aucune ligne sans fichier, aucun fichier sans ligne : ce que la rétention ne doit jamais casser.
    dangling: () => [...rows.values()].flat().filter(({ file }) => !files.has(file)).length,
    orphans: () =>
      [...files.keys()].filter((file) => ![...rows.values()].flat().some((known) => known.file === file))
        .length,
    totalBytes: () => [...files.values()].reduce((sum, { size }) => sum + size, 0),
    dropRow: (canvasId: string, tier: SnapshotTier, takenAt: number) =>
      rows.set(
        canvasId,
        (rows.get(canvasId) ?? []).filter((known) => !(known.tier === tier && known.takenAt === takenAt)),
      ),
    failNextReads: (count: number) => {
      failReads = count;
    },
    onMutation: (run: () => void) => {
      onMutation = run;
    },
  };
}

const snapshot: CanvasSnapshot = {
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  canvasId: "canvas-1",
  version: 100,
  takenAt: NOW,
  meta: { width: "2", height: "2" },
  authors: [],
  placements: [],
  cells: [],
  progress: {},
  bans: [],
  bansTwitch: [],
  banProofs: {},
  cleared: {},
  clearedPlacements: [],
  clearedRanges: {},
  mods: [],
  modsTwitch: [],
  modsLiveplace: [],
  twitchUsers: {},
  reported: [],
  reports: {},
  offStream: [],
  approved: [],
};

function setup(initial: Record<string, TierRow[]>) {
  const convex = createFakeConvex(initial);
  const clock = { now: NOW };
  const logs: string[] = [];
  const images: number[] = [];
  const cycle = createRetentionCycle({
    store: convex.store,
    decode: async () => ({ ok: true, value: snapshot }),
    encodeImage: async (image) => {
      images.push(image.width * image.height);
      return new Uint8Array(IMAGE_SIZE);
    },
    now: () => clock.now,
    log: (message) => logs.push(message),
  });
  return { ...convex, cycle, clock, logs, images };
}

describe("the retention cycle (Écart §7.3, JOURNAL 2026-10-08)", () => {
  // Un working de l'heure en cours entre dans l'horaire, avec le fichier de sa source : aucun octet ne bouge
  it("promotes a working save to the hourly tier and shares its file", async () => {
    const taken = NOW - 10 * 60_000;
    const { cycle, tiersOf, fileOf, totalBytes } = setup({ "canvas-1": [row("working", taken)] });

    await cycle.start();
    await cycle.tick();

    expect(tiersOf("canvas-1")).toEqual([
      { tier: "working", takenAt: taken, isStateOnly: false },
      { tier: "hourly", takenAt: taken, isStateOnly: false },
    ]);
    expect(fileOf("canvas-1", "hourly", taken)).toBe(fileOf("canvas-1", "working", taken));
    expect(totalBytes()).toBe(FULL_SIZE);
  });

  // Un jour fini entre dans le quotidien (complet, fichier partagé) ; une semaine finie dans l'hebdomadaire, en `state` seul
  it("promotes a closed day to the daily tier and a closed week to the weekly tier in state only", async () => {
    const taken = Date.UTC(2026, 9, 3, 10); // samedi 3 octobre : sa journée et sa semaine sont finies, il y a moins de 7 jours
    const { cycle, tiersOf, fileOf, images, totalBytes } = setup({ "canvas-1": [row("working", taken)] });

    await cycle.start();
    await cycle.tick();

    expect(tiersOf("canvas-1")).toEqual([
      { tier: "working", takenAt: taken, isStateOnly: false },
      { tier: "daily", takenAt: taken, isStateOnly: false },
      { tier: "weekly", takenAt: taken, isStateOnly: true },
    ]);
    expect(fileOf("canvas-1", "daily", taken)).toBe(fileOf("canvas-1", "working", taken));
    expect(fileOf("canvas-1", "weekly", taken)).not.toBe(fileOf("canvas-1", "working", taken));
    expect(images).toEqual([4]); // un seul dessin extrait, celui de l'hebdomadaire
    expect(totalBytes()).toBe(FULL_SIZE + IMAGE_SIZE);
  });

  // Au-delà de 7 jours, le quotidien ne garde que le dessin : le fichier complet part s'il n'a plus de ligne
  it("degrades a daily save older than 7 days to state only and frees its full file", async () => {
    const taken = NOW - DAILY_FULL_MS - DAY_MS;
    const { cycle, tiersOf, dangling, orphans } = setup({ "canvas-1": [row("daily", taken)] });

    await cycle.start();
    await cycle.tick();

    expect(tiersOf("canvas-1")).toContainEqual({ tier: "daily", takenAt: taken, isStateOnly: true });
    expect(dangling()).toBe(0);
    expect(orphans()).toBe(0);
  });

  // Un fichier encore désigné par une autre ligne ne part pas avec le quotidien dégradé
  it("keeps the full file of a degraded daily while another row still points to it", async () => {
    const taken = NOW - DAILY_FULL_MS - DAY_MS;
    const { cycle, store, tiersOf, fileOf, dangling, orphans } = setup({
      "canvas-1": [row("working", taken)],
    });
    await store.promote("canvas-1", row("working", taken), "daily"); // le quotidien partage le fichier du travail
    const full = fileOf("canvas-1", "working", taken);
    await cycle.start();

    await cycle.tick();

    expect(tiersOf("canvas-1")).toContainEqual({ tier: "daily", takenAt: taken, isStateOnly: true });
    expect(fileOf("canvas-1", "daily", taken)).not.toBe(full);
    expect(fileOf("canvas-1", "working", taken)).toBe(full); // la sauvegarde de travail garde son fichier complet
    expect(dangling()).toBe(0);
    expect(orphans()).toBe(0);
  });

  // Le quotidien de plus de 30 jours et l'horaire de plus de 24 h s'en vont ; l'hebdomadaire reste. Un horaire qui s'en va après
  // avoir donné son fichier à un quotidien ne l'emporte pas avec lui.
  it("discards the expired tiers, keeps the weekly tier, and never deletes a file another row still uses", async () => {
    const longAgo = NOW - DAILY_KEPT_MS - 60 * DAY_MS;
    const hourlyAt = NOW - 25 * HOUR_MS;
    const { cycle, tiersOf, fileOf, dangling, orphans } = setup({
      "canvas-1": [row("hourly", hourlyAt), row("daily", longAgo), row("weekly", longAgo, true)],
    });
    const hourlyFile = fileOf("canvas-1", "hourly", hourlyAt);

    await cycle.start();
    await cycle.tick();

    expect(tiersOf("canvas-1")).toEqual([
      { tier: "weekly", takenAt: longAgo, isStateOnly: true },
      { tier: "daily", takenAt: hourlyAt, isStateOnly: false }, // hier a gardé la sauvegarde de l'horaire qui s'en va
    ]);
    expect(fileOf("canvas-1", "daily", hourlyAt)).toBe(hourlyFile);
    expect(dangling()).toBe(0);
    expect(orphans()).toBe(0);
  });

  // Une passe rejouée après l'avoir appliquée ne touche à rien : le worker peut s'arrêter et reprendre
  it("does nothing more on a second pass", async () => {
    const { cycle, clock, calls } = setup({
      "canvas-1": [row("working", Date.UTC(2026, 8, 30, 10)), row("daily", NOW - 10 * DAY_MS)],
    });
    await cycle.start();
    await cycle.tick();
    const applied = calls.length;
    clock.now += 60_000;

    await cycle.tick();

    expect(calls.slice(applied)).toEqual([]);
  });

  // Une lecture qui échoue arrête ce canvas seul, journalisé ; il est revu plus tard, les autres passent
  it("retries a failed canvas later without holding back the others", async () => {
    const taken = Date.UTC(2026, 9, 3, 10);
    const { cycle, clock, tiersOf, failNextReads, logs } = setup({
      "canvas-a": [row("working", taken)],
      "canvas-b": [row("working", taken)],
    });
    failNextReads(1); // la première lecture d'un fichier complet, celle de canvas-a
    await cycle.start();

    await cycle.tick();

    expect(logs).toEqual(["rétention de canvas-a échouée"]);
    expect(tiersOf("canvas-b")).toContainEqual({ tier: "weekly", takenAt: taken, isStateOnly: true });
    expect(tiersOf("canvas-a").some(({ tier }) => tier === "weekly")).toBe(false);

    clock.now += 6 * 60_000;
    await cycle.tick();

    expect(tiersOf("canvas-a")).toContainEqual({ tier: "weekly", takenAt: taken, isStateOnly: true });
  });

  // Une source disparue de Convex (canvas supprimé) s'oublie : plus aucun appel à la passe suivante
  it("forgets a row that Convex no longer has", async () => {
    const taken = NOW - 10 * 60_000;
    const { cycle, clock, calls, dropRow } = setup({ "canvas-1": [row("working", taken)] });
    await cycle.start();
    dropRow("canvas-1", "working", taken);
    await cycle.tick();
    const applied = calls.length;
    clock.now += 60_000;

    await cycle.tick();

    expect(calls.slice(applied)).toEqual([]);
  });

  // Les paliers d'un déploiement se lisent par lots : tous les canvas sont connus, aucun n'est lu deux fois
  it("reads the tiers page by page at start", async () => {
    const initial = Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [
        `canvas-${String(index).padStart(3, "0")}`,
        [row("working", NOW - 600_000)],
      ]),
    );
    const { cycle, calls, tiersOf } = setup(initial);

    await cycle.start();
    await cycle.tick();

    expect(calls.filter((call) => call === "listTiers")).toHaveLength(3);
    expect(tiersOf("canvas-119").map(({ tier }) => tier)).toEqual(["working", "hourly"]);
  });

  // Seules les deux dernières sauvegardes de travail comptent : celle d'il y a deux heures n'est plus promue
  it("counts only the two latest working saves of a canvas", async () => {
    const { cycle, calls } = setup({});
    for (const takenAt of [NOW - 2 * HOUR_MS, NOW - HOUR_MS, NOW - 60_000])
      cycle.noteStored({ canvasId: "canvas-1", version: 100, takenAt });

    await cycle.tick();

    expect(calls.filter((call) => call.startsWith("promote"))).toEqual([
      "promote canvas-1 working>hourly",
      "promote canvas-1 working>hourly",
    ]);
  });

  // Un tour rend la main passé son budget ; le reste de la passe reprend au tour suivant, sans attendre la minute
  it("hands back control after its time budget and resumes the pass on the next tick", async () => {
    const taken = NOW - 10 * 60_000;
    const { cycle, clock, onMutation, tiersOf } = setup({
      "canvas-a": [row("working", taken)],
      "canvas-b": [row("working", taken)],
    });
    onMutation(() => {
      clock.now += 6_000; // chaque écriture prend 6 s
    });
    await cycle.start();

    await cycle.tick();

    expect(tiersOf("canvas-a").some(({ tier }) => tier === "hourly")).toBe(true);
    expect(tiersOf("canvas-b").some(({ tier }) => tier === "hourly")).toBe(false);

    await cycle.tick();

    expect(tiersOf("canvas-b").some(({ tier }) => tier === "hourly")).toBe(true);
  });
});

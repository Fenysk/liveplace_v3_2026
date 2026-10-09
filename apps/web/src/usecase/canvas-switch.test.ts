import { type CanvasMeta, MAX_ARCHIVES } from "@liveplace/domain";
import type { ActiveCanvas, Archive, ArchiveInput, ReopenInput } from "@liveplace/domain/ports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveCanvas } from "./archive-canvas";
import { type SwitchDeps, withOwnerLock } from "./canvas-switch";
import { discardOwnerArchive } from "./discard-owner-archive";
import { reopenCanvas } from "./reopen-canvas";

// Écart §10.3 (JOURNAL 2026-10-06) : l'ordre des écritures fait l'opération fiable. Chaque double note ce qu'on lui
// demande, dans l'ordre ; un test lit ce journal de bout en bout, et chaque échec y laisse son défaire.

const ownerId = "owner-1";
const now = 5000;

const active: ActiveCanvas = { canvasId: "canvas-a", width: 50, height: 50, createdAt: 1000 };
const archiveOf = (canvasId: string, more: Partial<Archive> = {}): Archive => ({
  canvasId,
  width: 100,
  height: 100,
  createdAt: 100,
  archivedAt: 900,
  linkCode: "codeofarch",
  ...more,
});
const archived = archiveOf("canvas-c");

const metaOfActive: CanvasMeta = {
  ownerId,
  width: 50,
  height: 50,
  gaugeMaxStart: 12,
  gaugeMaxCeiling: 80,
  refillMs: 2000,
  refillCharges: 3,
  obsDelayMs: 20_000,
  obsBackground: "white",
};

type Convex = "refuses-full" | "refuses-stale" | "throws" | "commits-then-throws";

type Scenario = {
  active?: ActiveCanvas | null;
  archives?: Archive[];
  activeTheme?: string; // le thème du canvas actif dans la copie de Redis
  isLocked?: boolean; // un autre changement tient le verrou
  failsAt?: string; // la méthode de Redis qui lève
  convex?: Convex;
  previousSuccessor?: string; // le successeur qu'avait l'archive avant qu'on la rouvre
  isListFailing?: boolean;
  isReleaseFailing?: boolean;
};

const setup = (scenario: Scenario = {}) => {
  const log: string[] = [];
  const store = {
    active: scenario.active === undefined ? active : scenario.active,
    archives: scenario.archives ?? [archived],
  };
  const sent: { archive?: ArchiveInput; reopen?: ReopenInput; prepared?: CanvasMeta } = {};
  const act = (method: string, ...args: (string | number | null)[]): void => {
    log.push([method, ...args.map(String)].join(" ")); // `join` écrirait `null` en vide
    if (scenario.failsAt === method) throw new Error(`${method} a échoué`);
  };
  const commits = scenario.convex === "commits-then-throws";

  const redis: SwitchDeps["redis"] = {
    getCanvas: async (canvasId) =>
      canvasId === store.active?.canvasId
        ? { ...metaOfActive, ...(scenario.activeTheme ? { theme: scenario.activeTheme } : {}) }
        : {
            ...metaOfActive,
            archivedAt: 900,
            ...(scenario.previousSuccessor ? { successorId: scenario.previousSuccessor } : {}),
          },
    acquireOwnerLock: async () => {
      log.push("lock");
      return scenario.isLocked ? null : { ownerId, holderId: "holder-1" };
    },
    releaseOwnerLock: async () => {
      log.push("unlock");
      if (scenario.isReleaseFailing) throw new Error("verrou");
    },
    prepareCanvas: async (canvasId, meta) => {
      act("prepareCanvas", canvasId);
      sent.prepared = meta;
    },
    markReady: async (canvasId) => act("markReady", canvasId),
    markArchived: async (canvasId, { archivedAt, successorId }) =>
      act("markArchived", canvasId, archivedAt, successorId),
    markActive: async (canvasId) => act("markActive", canvasId),
    setSuccessor: async (canvasId, successorId) => act("setSuccessor", canvasId, successorId),
    copyShared: async (from, to) => act("copyShared", from, to),
    copyProgress: async (from, to) => act("copyProgress", from, to),
    settleReports: async (canvasId) => act("settleReports", canvasId),
    publishStatus: async (canvasId, status) => act("publishStatus", canvasId, status),
    setTheme: async (canvasId, theme) => act("setTheme", canvasId, theme ?? null),
    publishTheme: async (canvasId, theme) => act("publishTheme", canvasId, theme ?? null),
    discardCanvas: async (canvasId) => act("discardCanvas", canvasId),
    getCanvasImage: async () => null,
  };

  const durable: SwitchDeps["durable"] = {
    listCanvasesForOwner: async () => {
      if (scenario.isListFailing) throw new Error("Convex injoignable");
      return { active: store.active, archives: store.archives };
    },
    getActiveCanvasForOwner: async () =>
      store.active ? { canvasId: store.active.canvasId, width: 50, height: 50 } : null,
    archiveActiveCanvas: async (input) => {
      log.push(`convex.archive ${input.outgoingId} ${input.incoming.canvasId}`);
      sent.archive = input;
      if (scenario.convex === "refuses-full") return { ok: false, error: "archives_full" };
      if (scenario.convex === "refuses-stale") return { ok: false, error: "not_active" };
      if (scenario.convex === "throws") throw new Error("Convex injoignable");
      if (commits && store.active) {
        store.archives = [...store.archives, archiveOf(store.active.canvasId, { linkCode: input.linkCode })];
        store.active = { ...input.incoming, createdAt: input.archivedAt };
        throw new Error("réponse perdue");
      }
      return { ok: true, value: undefined };
    },
    reopenArchive: async (input) => {
      log.push(`convex.reopen ${input.outgoingId} ${input.reopenedId}`);
      sent.reopen = input;
      if (scenario.convex === "refuses-stale") return { ok: false, error: "not_active" };
      if (scenario.convex === "refuses-full") return { ok: false, error: "not_archive" };
      if (scenario.convex === "throws") throw new Error("Convex injoignable");
      if (commits && store.active) {
        store.active = { ...store.active, canvasId: input.reopenedId };
        throw new Error("réponse perdue");
      }
      return { ok: true, value: undefined };
    },
    discardArchive: async (_ownerId, canvasId) => {
      log.push(`convex.discard ${canvasId}`);
      if (scenario.convex === "throws") throw new Error("Convex injoignable");
      if (!store.archives.some((archive) => archive.canvasId === canvasId))
        return { ok: false, error: "not_archive" };
      return { ok: true, value: undefined };
    },
  };

  const deps: SwitchDeps = {
    durable,
    redis,
    now: () => now,
    randomCanvasId: () => "new-1",
    randomLinkCode: () => "freshcode1",
  };
  return { deps, log, sent };
};

const archiveRequest = { canvasId: active.canvasId, theme: "", progress: "keep" } as const;
const reopenRequest = { canvasId: archived.canvasId, progress: "keep" } as const;

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => logged.mockRestore());

describe("withOwnerLock (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Refuse quand un autre changement tient le verrou, sans rien faire
  it("refuses when another change holds the lock, doing nothing", async () => {
    const { deps, log } = setup({ isLocked: true });
    const run = vi.fn();

    expect(await withOwnerLock(deps, ownerId, run)).toEqual({ ok: false, error: "busy" });

    expect(run).not.toHaveBeenCalled();
    expect(log).toEqual(["lock"]);
  });

  // Rend le verrou à la fin, et une erreur imprévue donne `failed` plutôt qu'un échec muet
  it("gives the lock back at the end, and turns an unexpected error into failed", async () => {
    const { deps, log } = setup();

    const result = await withOwnerLock(deps, ownerId, async () => {
      throw new Error("imprévu");
    });

    expect(result).toEqual({ ok: false, error: "failed" });
    expect(log).toEqual(["lock", "unlock"]);
    expect(logged).toHaveBeenCalled();
  });

  // Un verrou qui ne se rend pas se journalise, sans masquer le résultat
  it("logs a lock that cannot be given back, without hiding the result", async () => {
    const { deps } = setup({ isReleaseFailing: true });

    expect(await withOwnerLock(deps, ownerId, async () => ({ ok: true, value: undefined }))).toEqual({
      ok: true,
      value: undefined,
    });

    expect(logged).toHaveBeenCalledWith("canvases : verrou non rendu", expect.any(Error));
  });
});

describe("archiveCanvas (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Dans l'ordre : le nouveau canvas sans `ready`, l'ancien figé, le commun, la progression, `ready`, Convex, les
  // signalements classés, le thème de l'archive, le statut publié, le verrou rendu
  it("goes in order: the new canvas without ready, the old one frozen, the shared part, the progress, ready, Convex, reports settled, the theme of the archive, status published, lock given back", async () => {
    const { deps, log } = setup();

    expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: true, value: undefined });

    expect(log).toEqual([
      "lock",
      "prepareCanvas new-1",
      "markArchived canvas-a 5000 new-1",
      "copyShared canvas-a new-1",
      "copyProgress canvas-a new-1",
      "markReady new-1",
      "convex.archive canvas-a new-1",
      "settleReports canvas-a",
      "setTheme canvas-a null",
      "publishStatus canvas-a archived",
      "unlock",
    ]);
  });

  // « Repartir » ne recopie aucune progression
  it("copies no progress on a restart", async () => {
    const { deps, log } = setup();

    await archiveCanvas(deps, ownerId, { ...archiveRequest, progress: "restart" });

    expect(log.some((entry) => entry.startsWith("copyProgress"))).toBe(false);
    expect(log).toContain("markReady new-1");
  });

  // Le nouveau canvas est vide, de la même taille, avec les mêmes jauges et la même recharge que celui qu'il remplace
  it("makes the new canvas the same size, with the same gauges and refill as the one it replaces", async () => {
    const { deps, sent } = setup();

    await archiveCanvas(deps, ownerId, archiveRequest);

    expect(sent.prepared).toEqual(metaOfActive);
    expect(sent.prepared).not.toHaveProperty("archivedAt");
  });

  // Donne à Convex le thème nettoyé, le code tiré, la date, et le nouveau canvas
  it("hands Convex the cleaned theme, the drawn code, the date and the new canvas", async () => {
    const { deps, sent } = setup();

    await archiveCanvas(deps, ownerId, { ...archiveRequest, theme: "  Fête   du\t14  " });

    expect(sent.archive).toEqual({
      ownerId,
      outgoingId: "canvas-a",
      incoming: { canvasId: "new-1", width: 50, height: 50 },
      archivedAt: now,
      linkCode: "freshcode1",
      theme: "Fête du 14",
    });
  });

  // Sans thème donné, aucun thème ; un canvas rouvert garde son code
  it("gives no theme when none is given, and lets a reopened canvas keep its code", async () => {
    const { deps, sent } = setup({ active: { ...active, linkCode: "mycode1234", theme: "Avant" } });

    await archiveCanvas(deps, ownerId, { ...archiveRequest, theme: "   " });

    expect(sent.archive).not.toHaveProperty("theme");
    expect(sent.archive?.linkCode).toBe("mycode1234");
  });

  // Le thème du dialogue va sur le canvas archivé, dans la copie de Redis, sans rien publier : ses pages changent de canvas
  it("puts the theme of the dialog on the archived canvas in Redis, publishing nothing: its pages move to another canvas", async () => {
    const { deps, log } = setup({ activeTheme: "Avant" });

    await archiveCanvas(deps, ownerId, { ...archiveRequest, theme: "  Fête   du\t14  " });

    expect(log).toContain("setTheme canvas-a Fête du 14");
    expect(log.some((entry) => entry.startsWith("publishTheme"))).toBe(false);
  });

  // Sans thème dans le dialogue, la copie de Redis perd l'ancien : elle égale toujours Convex
  it("drops the old theme from the copy in Redis when the dialog gives none: it always equals Convex", async () => {
    const { deps, log } = setup({ activeTheme: "Avant" });

    await archiveCanvas(deps, ownerId, { ...archiveRequest, theme: "" });

    expect(log).toContain("setTheme canvas-a null");
  });

  // Le canvas neuf part sans thème, même quand l'ancien en avait un
  it("starts the new canvas with no theme, even when the old one had one", async () => {
    const { deps, sent } = setup({ activeTheme: "Halloween" });

    await archiveCanvas(deps, ownerId, { ...archiveRequest, theme: "Halloween" });

    expect(sent.prepared).toEqual(metaOfActive);
    expect(sent.prepared).not.toHaveProperty("theme");
  });

  // Refuse quand un autre changement est en cours
  it("refuses while another change is under way", async () => {
    const { deps, log } = setup({ isLocked: true });

    expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: false, error: "busy" });

    expect(log).toEqual(["lock"]);
  });

  // Refuse sans rien écrire dans Redis quand la page ne montre plus le canvas actif
  it("refuses, writing nothing in Redis, when the page no longer shows the active canvas", async () => {
    const { deps, log } = setup();

    expect(await archiveCanvas(deps, ownerId, { ...archiveRequest, canvasId: "canvas-elsewhere" })).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(await archiveCanvas(deps, ownerId, { ...archiveRequest, canvasId: archived.canvasId })).toEqual({
      ok: false,
      error: "not_active",
    });

    expect(log).toEqual(["lock", "unlock", "lock", "unlock"]);
  });

  // Refuse sans rien écrire dans Redis avec le plafond d'archives atteint
  it("refuses, writing nothing in Redis, once the archive ceiling is reached", async () => {
    const full = Array.from({ length: MAX_ARCHIVES }, (_, index) => archiveOf(`canvas-${index}`));
    const { deps, log } = setup({ archives: full });

    expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: false, error: "archives_full" });

    expect(log).toEqual(["lock", "unlock"]);
  });

  // À chaque échec de Redis avant Convex : l'ancien canvas est défigé, le nouveau effacé, le verrou rendu
  for (const failsAt of ["prepareCanvas", "markArchived", "copyShared", "copyProgress", "markReady"]) {
    it(`undoes everything when ${failsAt} fails: the old canvas thawed, the new one erased, the lock given back`, async () => {
      const { deps, log } = setup({ failsAt });

      expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: false, error: "failed" });

      expect(log.slice(-3)).toEqual(["markActive canvas-a", "discardCanvas new-1", "unlock"]);
      expect(log.some((entry) => entry.startsWith("convex."))).toBe(false);
      expect(log.some((entry) => entry.startsWith("publishStatus"))).toBe(false);
      expect(log.some((entry) => entry.startsWith("setTheme"))).toBe(false);
      expect(logged).toHaveBeenCalled();
    });
  }

  // Le refus de Convex (cinq archives, course entre deux onglets) défait tout, et le dit
  it("undoes everything when Convex refuses, and says why", async () => {
    for (const [convex, error] of [
      ["refuses-full", "archives_full"],
      ["refuses-stale", "not_active"],
    ] as const) {
      const { deps, log } = setup({ convex });

      expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: false, error });

      expect(log.slice(-4)).toEqual([
        "convex.archive canvas-a new-1",
        "markActive canvas-a",
        "discardCanvas new-1",
        "unlock",
      ]);
      expect(log.some((entry) => entry.startsWith("setTheme"))).toBe(false);
    }
  });

  // Convex qui ne répond pas, et n'a rien retenu : tout est défait
  it("undoes everything when Convex does not answer and kept nothing", async () => {
    const { deps, log } = setup({ convex: "throws" });

    expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: false, error: "failed" });

    expect(log.slice(-3)).toEqual(["markActive canvas-a", "discardCanvas new-1", "unlock"]);
  });

  // Convex qui a retenu l'archivage avant de perdre sa réponse : on continue, jamais défaire un changement fait
  it("goes on when Convex kept the archive before losing its answer: a change that was made is never undone", async () => {
    const { deps, log } = setup({ convex: "commits-then-throws" });

    expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: true, value: undefined });

    expect(log.slice(-5)).toEqual([
      "convex.archive canvas-a new-1",
      "settleReports canvas-a",
      "setTheme canvas-a null",
      "publishStatus canvas-a archived",
      "unlock",
    ]);
    expect(log).not.toContain("markActive canvas-a");
  });

  // Après Convex, rien ne fait échouer l'archivage : classer, copier le thème et publier sont journalisés s'ils manquent
  it("fails nothing once Convex has decided: settling, copying the theme and publishing are logged when they fail", async () => {
    for (const failsAt of ["settleReports", "setTheme", "publishStatus"]) {
      const { deps, log } = setup({ failsAt });

      expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: true, value: undefined });

      expect(log.at(-1)).toBe("unlock");
      expect(log).toContain("publishStatus canvas-a archived");
      expect(logged).toHaveBeenCalled();
    }
  });

  // Une erreur de Convex à la lecture n'écrit rien dans Redis, et rend le verrou
  it("writes nothing in Redis when Convex fails on the first read, and gives the lock back", async () => {
    const { deps, log } = setup({ isListFailing: true });

    expect(await archiveCanvas(deps, ownerId, archiveRequest)).toEqual({ ok: false, error: "failed" });

    expect(log).toEqual(["lock", "unlock"]);
  });
});

describe("reopenCanvas (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Dans l'ordre : le successeur de l'archive retiré, l'actif figé, le commun, Convex, la progression, les
  // signalements classés, le thème de l'archive, l'archive défigée, les statuts publiés, le verrou rendu
  it("goes in order: the archive's successor removed, the active one frozen, the shared part, Convex, the progress, reports settled, the archive's theme, the archive thawed, statuses published, lock given back", async () => {
    const { deps, log } = setup();

    expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: true, value: undefined });

    expect(log).toEqual([
      "lock",
      "setSuccessor canvas-c null",
      "markArchived canvas-a 5000 canvas-c",
      "copyShared canvas-a canvas-c",
      "convex.reopen canvas-a canvas-c",
      "copyProgress canvas-a canvas-c",
      "settleReports canvas-a",
      "setTheme canvas-c null",
      "markActive canvas-c",
      "publishStatus canvas-a archived",
      "publishStatus canvas-c active",
      "unlock",
    ]);
  });

  // La copie de Redis du canvas rouvert reprend le thème de Convex, celui que l'archive avait : il s'affiche à tous
  it("gives the reopened canvas the theme Convex has for it in the copy in Redis, the one the archive had", async () => {
    const { deps, log } = setup({ archives: [archiveOf("canvas-c", { theme: "Printemps" })] });

    await reopenCanvas(deps, ownerId, reopenRequest);

    expect(log).toContain("setTheme canvas-c Printemps");
    expect(log.some((entry) => entry.startsWith("setTheme canvas-a"))).toBe(false);
  });

  // « Repartir de la progression de ce canvas » : l'archive garde la sienne, rien n'est recopié
  it("keeps the archive's own progress on a restart: nothing is copied", async () => {
    const { deps, log } = setup();

    await reopenCanvas(deps, ownerId, { ...reopenRequest, progress: "restart" });

    expect(log.some((entry) => entry.startsWith("copyProgress"))).toBe(false);
    expect(log).toContain("markActive canvas-c");
  });

  // Donne à Convex le canvas actif, l'archive, la date, et un code pour l'actif s'il n'en a pas
  it("hands Convex the active canvas, the archive, the date, and a code for the active one if it has none", async () => {
    const { deps, sent } = setup();

    await reopenCanvas(deps, ownerId, reopenRequest);

    expect(sent.reopen).toEqual({
      ownerId,
      outgoingId: "canvas-a",
      reopenedId: "canvas-c",
      archivedAt: now,
      linkCode: "freshcode1",
    });
  });

  // Refuse sans rien écrire dans Redis ce qui n'est pas une archive de ce propriétaire : l'actif, un autre, un inconnu
  it("refuses, writing nothing in Redis, what is no archive of this owner: the active one, another's, unknown", async () => {
    const { deps, log } = setup();

    for (const canvasId of [active.canvasId, "canvas-elsewhere"])
      expect(await reopenCanvas(deps, ownerId, { ...reopenRequest, canvasId })).toEqual({
        ok: false,
        error: "not_archive",
      });

    expect(log).toEqual(["lock", "unlock", "lock", "unlock"]);
  });

  // Refuse sans rien écrire quand il n'y a pas de canvas actif à mettre à sa place
  it("refuses, writing nothing, when there is no active canvas to put in its place", async () => {
    const { deps, log } = setup({ active: null });

    expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: false, error: "not_active" });

    expect(log).toEqual(["lock", "unlock"]);
  });

  // Refuse quand un autre changement est en cours
  it("refuses while another change is under way", async () => {
    const { deps } = setup({ isLocked: true });

    expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: false, error: "busy" });
  });

  // À chaque échec de Redis avant Convex : l'actif est défigé, l'archive retrouve son successeur, le verrou est rendu
  for (const failsAt of ["setSuccessor", "markArchived", "copyShared"]) {
    it(`undoes everything when ${failsAt} fails: the active one thawed, the archive's successor put back, the lock given back`, async () => {
      const { deps, log } = setup({ failsAt, previousSuccessor: "canvas-old" });

      expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: false, error: "failed" });

      expect(log.slice(-3)).toEqual(["markActive canvas-a", "setSuccessor canvas-c canvas-old", "unlock"]);
      expect(log.some((entry) => entry.startsWith("convex."))).toBe(false);
      expect(log.some((entry) => entry.startsWith("setTheme"))).toBe(false);
    });
  }

  // Une archive qui n'avait pas de successeur n'en retrouve pas
  it("puts back no successor on an archive that had none", async () => {
    const { deps, log } = setup({ failsAt: "copyShared" });

    await reopenCanvas(deps, ownerId, reopenRequest);

    expect(log.slice(-3)).toEqual(["markActive canvas-a", "setSuccessor canvas-c null", "unlock"]);
  });

  // Le refus de Convex défait tout, et le dit ; la progression de l'archive n'a pas bougé
  it("undoes everything when Convex refuses, and says why: the archive's progress has not moved", async () => {
    const { deps, log } = setup({ convex: "refuses-stale", previousSuccessor: "canvas-old" });

    expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: false, error: "not_active" });

    expect(log.slice(-4)).toEqual([
      "convex.reopen canvas-a canvas-c",
      "markActive canvas-a",
      "setSuccessor canvas-c canvas-old",
      "unlock",
    ]);
    expect(log.some((entry) => entry.startsWith("copyProgress"))).toBe(false);
  });

  // Convex qui ne répond pas et n'a rien retenu : tout est défait ; qui a retenu avant de perdre sa réponse : on continue
  it("undoes everything when Convex does not answer and kept nothing, but goes on when it kept the swap", async () => {
    const lost = setup({ convex: "throws" });
    const kept = setup({ convex: "commits-then-throws" });

    expect(await reopenCanvas(lost.deps, ownerId, reopenRequest)).toEqual({ ok: false, error: "failed" });
    expect(await reopenCanvas(kept.deps, ownerId, reopenRequest)).toEqual({ ok: true, value: undefined });

    expect(lost.log).toContain("markActive canvas-a");
    expect(kept.log).toContain("markActive canvas-c");
    expect(kept.log).not.toContain("markActive canvas-a");
  });

  // Après Convex, une progression qui ne se recopie pas n'empêche ni de défiger l'archive ni d'annoncer le changement
  it("lets a progress that cannot be copied stop neither the archive from being thawed nor the change from being announced", async () => {
    const { deps, log } = setup({ failsAt: "copyProgress" });

    expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: true, value: undefined });

    expect(log.slice(-6)).toEqual([
      "settleReports canvas-a",
      "setTheme canvas-c null",
      "markActive canvas-c",
      "publishStatus canvas-a archived",
      "publishStatus canvas-c active",
      "unlock",
    ]);
    expect(logged).toHaveBeenCalled();
  });

  // Une copie du thème qui ne s'écrit pas n'empêche ni de défiger l'archive ni d'annoncer le changement : journalisée
  it("lets a theme that cannot be copied stop neither the archive from being thawed nor the change from being announced", async () => {
    const { deps, log } = setup({ failsAt: "setTheme" });

    expect(await reopenCanvas(deps, ownerId, reopenRequest)).toEqual({ ok: true, value: undefined });

    expect(log.slice(-4)).toEqual([
      "markActive canvas-c",
      "publishStatus canvas-a archived",
      "publishStatus canvas-c active",
      "unlock",
    ]);
    expect(logged).toHaveBeenCalledWith(
      "canvases : thème de l'archive rouverte non copié",
      expect.any(Error),
    );
  });
});

describe("discardOwnerArchive (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Dans l'ordre : Convex supprime, le statut est publié, les clés sont effacées, le verrou est rendu
  it("goes in order: Convex discards, the status is published, the keys are erased, the lock is given back", async () => {
    const { deps, log } = setup();

    expect(await discardOwnerArchive(deps, ownerId, { canvasId: archived.canvasId })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(log).toEqual([
      "lock",
      "convex.discard canvas-c",
      "publishStatus canvas-c discarded",
      "discardCanvas canvas-c",
      "unlock",
    ]);
  });

  // Convex refuse le canvas actif et ce qui n'est pas au propriétaire : rien n'est publié ni effacé
  it("lets Convex refuse the active canvas and what is not the owner's: nothing is published or erased", async () => {
    const { deps, log } = setup();

    for (const canvasId of [active.canvasId, "canvas-elsewhere"])
      expect(await discardOwnerArchive(deps, ownerId, { canvasId })).toEqual({
        ok: false,
        error: "not_archive",
      });

    expect(
      log.filter((entry) => entry.startsWith("publishStatus") || entry.startsWith("discardCanvas")),
    ).toEqual([]);
  });

  // Refuse quand un autre changement est en cours
  it("refuses while another change is under way", async () => {
    const { deps, log } = setup({ isLocked: true });

    expect(await discardOwnerArchive(deps, ownerId, { canvasId: archived.canvasId })).toEqual({
      ok: false,
      error: "busy",
    });

    expect(log).toEqual(["lock"]);
  });

  // Convex qui ne répond pas : rien n'est publié ni effacé, et le verrou est rendu
  it("publishes and erases nothing when Convex does not answer, and gives the lock back", async () => {
    const { deps, log } = setup({ convex: "throws" });

    expect(await discardOwnerArchive(deps, ownerId, { canvasId: archived.canvasId })).toEqual({
      ok: false,
      error: "failed",
    });

    expect(log).toEqual(["lock", "convex.discard canvas-c", "unlock"]);
  });

  // Une fois la suppression retenue, un échec de Redis la laisse faite : les clés restantes sont journalisées
  it("leaves the discard done when Redis fails after Convex: the remaining keys are logged", async () => {
    for (const failsAt of ["publishStatus", "discardCanvas"]) {
      const { deps, log } = setup({ failsAt });

      expect(await discardOwnerArchive(deps, ownerId, { canvasId: archived.canvasId })).toEqual({
        ok: true,
        value: undefined,
      });

      expect(log).toContain("discardCanvas canvas-c");
      expect(logged).toHaveBeenCalled();
    }
  });
});

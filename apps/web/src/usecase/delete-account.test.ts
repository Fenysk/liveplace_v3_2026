import { DELETED_ACCOUNT_TTL_SECONDS } from "@liveplace/domain";
import type {
  AccountPurge,
  DeletedAccountMark,
  DeletedProfile,
  PendingDeletion,
} from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginAccountDeletion,
  type DeleteAccountDeps,
  deleteAccount,
  finishPendingDeletion,
  resumePendingDeletions,
} from "./delete-account";

const now = 1_700_000_000_000;
const userId = "1234";
const profile: DeletedProfile = { login: "fenysk", avatarUrl: "https://avatar" };

type Faults = { purgeTraces?: number; rewrite?: boolean[]; deleteUser?: number; subscriptions?: number };

// Des doubles qui notent chaque étape dans l'ordre où elle part, et une panne à volonté (n échecs de l'étape).
const doubles = (faults: Faults = {}, ownedCanvasIds: string[] = ["canvas-active", "canvas-archive"]) => {
  const steps: string[] = [];
  const pending = new Map<string, PendingDeletion>();
  const proofs: object[] = [];
  const forgotten: DeletedProfile[] = [];
  const remaining = {
    purgeTraces: faults.purgeTraces ?? 0,
    deleteUser: faults.deleteUser ?? 0,
    subscriptions: faults.subscriptions ?? 0,
  };
  // Les comptes dont Twitch a retiré les abonnements, et ce que l'étape a vu de Redis à cet instant.
  const subscriptions: { userId: string; wasPending: boolean }[] = [];
  const rewrites = [...(faults.rewrite ?? [])];
  let owned = [...ownedCanvasIds];
  let isUserKnown = true;
  let areMarksRestored = true;
  const restored: { marks: readonly DeletedAccountMark[]; nowMs: number }[] = [];
  const kept: DeletedAccountMark[] = [];
  let runs = 0;

  const purge: AccountPurge = {
    getPending: async (id) => pending.get(id) ?? null,
    listPending: async () => [...pending.values()],
    begin: async (deletion) => {
      steps.push("begin");
      if (!pending.has(deletion.userId)) pending.set(deletion.userId, deletion);
    },
    purgeOwnedCanvases: async (_ownerId, canvasIds) => {
      steps.push(`purgeOwnedCanvases ${canvasIds.join(",")}`);
    },
    purgeTraces: async () => {
      steps.push("purgeTraces");
      if (remaining.purgeTraces-- > 0) throw new Error("Redis a coupé");
      return 3;
    },
    purgeAccountKeys: async () => {
      steps.push("purgeAccountKeys");
    },
    finish: async (id) => {
      steps.push("finish");
      pending.delete(id);
    },
    rewriteAppendOnlyFile: async () => {
      steps.push("rewriteAppendOnlyFile");
      return rewrites.shift() ?? true;
    },
    getFingerprint: (id) => `fingerprint-of-${id}`,
    areMarksRestored: async () => {
      steps.push("areMarksRestored");
      return areMarksRestored;
    },
    restoreMarks: async (marks, nowMs) => {
      steps.push("restoreMarks");
      restored.push({ marks, nowMs });
      areMarksRestored = true;
    },
  };

  const deps: DeleteAccountDeps = {
    durable: {
      listCanvasesForOwner: async () => ({
        active: { canvasId: "canvas-active", width: 10, height: 10, createdAt: 1 },
        archives: [
          { canvasId: "canvas-archive", width: 10, height: 10, createdAt: 1, archivedAt: 2, linkCode: "x" },
        ],
      }),
      discardOwnedCanvases: async () => {
        steps.push("discardOwnedCanvases");
        const discarded = owned;
        owned = [];
        return discarded;
      },
      requestErasure: async () => {
        steps.push("requestErasure");
      },
      keepDeletedAccount: async (mark) => {
        steps.push("keepDeletedAccount");
        kept.push(mark);
      },
      syncDeletedAccounts: async (since) => {
        steps.push(`syncDeletedAccounts ${since}`);
        return kept;
      },
      deleteUser: async (_id, proof) => {
        steps.push("deleteUser");
        if (remaining.deleteUser-- > 0) throw new Error("Convex a coupé");
        proofs.push(proof);
        const known = isUserKnown;
        isUserKnown = false;
        return known ? profile : null;
      },
      detachDiscoveredAccounts: async () => {
        steps.push("detachDiscoveredAccounts");
      },
    },
    purge,
    eventSub: {
      deleteSubscriptions: async (id) => {
        if (remaining.subscriptions-- > 0) throw new Error("Twitch ne répond pas");
        subscriptions.push({ userId: id, wasPending: pending.has(id) });
      },
    },
    forgetOwner: (forgottenProfile) => {
      forgotten.push(forgottenProfile);
    },
    now: () => now,
    randomRunId: () => `run-${++runs}`,
  };
  return {
    deps,
    steps,
    pending,
    proofs,
    forgotten,
    subscriptions,
    kept,
    restored,
    loseMarks: () => {
      areMarksRestored = false;
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteAccount (CDC §8, Supprimer son compte)", () => {
  // Marque l'effacement, vide Convex de ses fresques, puis Redis, ses traces avant son miroir, et finit en dernier
  it("marks the deletion, deletes the canvases in Convex before Redis, the traces before the mirror, and finishes last", async () => {
    const { deps, steps, pending, proofs, forgotten } = doubles();

    const result = await deleteAccount(deps, { userId, trigger: "button" });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(steps).toEqual([
      "begin",
      "keepDeletedAccount",
      "discardOwnedCanvases",
      "purgeOwnedCanvases canvas-active,canvas-archive",
      "purgeTraces",
      "requestErasure",
      "deleteUser",
      "detachDiscoveredAccounts",
      "purgeAccountKeys",
      "finish",
      "rewriteAppendOnlyFile",
    ]);
    expect(pending.size).toBe(0);
    expect(forgotten).toEqual([profile]);
    // La preuve : un `runId` tiré au hasard, l'heure du début, le déclencheur, le nombre de fresques. Rien qui nomme le compte.
    expect(proofs).toEqual([{ runId: "run-1", deletedAt: now, trigger: "button", ownedCanvases: 2 }]);
    expect(JSON.stringify(proofs)).not.toContain(userId);
  });

  // Un streamer sans fresque ni profil connu se supprime aussi, sans rien oublier de ce qui n'existe pas
  it("deletes an account that has no canvas, and forgets no cache of a profile that was already gone", async () => {
    const { deps, steps, forgotten } = doubles({}, []);
    deps.durable.listCanvasesForOwner = async () => ({ active: null, archives: [] });
    deps.durable.deleteUser = async () => null;

    const result = await deleteAccount(deps, { userId, trigger: "twitch" });

    expect(result.ok).toBe(true);
    expect(steps).toContain("purgeOwnedCanvases ");
    expect(forgotten).toEqual([]);
  });

  // Coupée en plein effacement, elle dit `failed`, laisse l'effacement en cours, et ne journalise jamais l'identifiant
  it("says failed when it is cut, leaves the deletion in progress, and never logs the identifier", async () => {
    const { deps, steps, pending, proofs } = doubles({ purgeTraces: 1 });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await deleteAccount(deps, { userId, trigger: "button" });

    expect(result).toEqual({ ok: false, error: "failed" });
    expect(steps.at(-1)).toBe("purgeTraces");
    expect([...pending.keys()]).toEqual([userId]);
    expect(proofs).toEqual([]); // la preuve ne part qu'avec la ligne du compte
    expect(JSON.stringify(logged.mock.calls)).not.toContain(userId);
  });

  // La reprise finit seule ce que la coupure a laissé, avec la même preuve : le `runId` et l'heure d'origine
  it("resumes by itself where the cut left off, with the same run and time", async () => {
    const { deps, steps, pending, proofs } = doubles({ purgeTraces: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccount(deps, { userId, trigger: "button" });
    steps.length = 0;

    await resumePendingDeletions(deps);

    expect(pending.size).toBe(0);
    expect(steps).toEqual([
      "areMarksRestored",
      "keepDeletedAccount",
      "discardOwnedCanvases",
      "purgeOwnedCanvases canvas-active,canvas-archive",
      "purgeTraces",
      "requestErasure",
      "deleteUser",
      "detachDiscoveredAccounts",
      "purgeAccountKeys",
      "finish",
      "rewriteAppendOnlyFile",
    ]);
    expect(proofs).toEqual([{ runId: "run-1", deletedAt: now, trigger: "button", ownedCanvases: 2 }]);
  });

  // Les fresques que Convex a déjà oubliées sont vidées d'après l'effacement en cours, pas d'après Convex
  it("empties from the deletion in progress the canvases Convex already forgot", async () => {
    const { deps, steps } = doubles({ purgeTraces: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccount(deps, { userId, trigger: "button" }); // Convex a oublié ses fresques, Redis a coupé
    steps.length = 0;
    deps.durable.listCanvasesForOwner = async () => ({ active: null, archives: [] });

    await resumePendingDeletions(deps);

    expect(steps).toContain("purgeOwnedCanvases canvas-active,canvas-archive");
  });

  // Relancée sur un compte déjà effacé, elle ne change rien : plus de profil, plus de fresque
  it("changes nothing when it runs again on an account already deleted", async () => {
    const { deps, forgotten, pending } = doubles();
    await deleteAccount(deps, { userId, trigger: "button" });

    const again = await deleteAccount(deps, { userId, trigger: "button" });

    expect(again.ok).toBe(true);
    expect(forgotten).toEqual([profile]); // une seule fois : le profil n'était plus là
    expect(pending.size).toBe(0);
  });

  // Une réécriture de l'AOF refusée parce qu'une autre tourne ne fait pas échouer la suppression : la reprise la refait
  it("does not fail when a rewrite of the append-only file was refused, and the resume tries it again", async () => {
    const { deps, steps } = doubles({ rewrite: [false, true] });

    const result = await deleteAccount(deps, { userId, trigger: "button" });
    await resumePendingDeletions(deps);

    expect(result.ok).toBe(true);
    expect(steps.filter((step) => step === "rewriteAppendOnlyFile")).toHaveLength(2);
  });

  // Une réécriture qui échoue ne fait pas échouer non plus une suppression finie, et ne se journalise pas avec l'identifiant
  it("does not fail either when the rewrite throws, and logs it without the identifier", async () => {
    const { deps } = doubles();
    deps.purge.rewriteAppendOnlyFile = async () => {
      throw new Error("Redis a coupé");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await deleteAccount(deps, { userId, trigger: "button" });

    expect(result.ok).toBe(true);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(userId);
  });
});

describe("resumePendingDeletions (CDC §8)", () => {
  // Ne fait rien sans effacement en cours, et rend la main
  it("does nothing when no deletion is in progress", async () => {
    const { deps, steps } = doubles();

    await resumePendingDeletions(deps);

    expect(steps).toEqual(["areMarksRestored", "rewriteAppendOnlyFile"]);
  });

  // Un passage qui échoue ne rejette jamais et laisse l'effacement en cours ; le passage suivant le finit
  it("never rejects when a pass fails, leaves the deletion in progress, and the next pass finishes it", async () => {
    const { deps, pending, proofs } = doubles({ purgeTraces: 1, deleteUser: 1 });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccount(deps, { userId, trigger: "contact" });

    await expect(resumePendingDeletions(deps)).resolves.toBeUndefined();
    expect(pending.size).toBe(1);
    await resumePendingDeletions(deps);

    expect(pending.size).toBe(0);
    expect(proofs).toEqual([{ runId: "run-1", deletedAt: now, trigger: "contact", ownedCanvases: 2 }]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(userId);
  });

  // Une liste des effacements en cours illisible ne rejette pas non plus
  it("never rejects either when the list of deletions in progress cannot be read", async () => {
    const { deps } = doubles();
    deps.purge.listPending = async () => {
      throw new Error("Redis a coupé");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(resumePendingDeletions(deps)).resolves.toBeUndefined();
  });
});

describe("finishPendingDeletion (CDC §8)", () => {
  // Sans effacement en cours, une reconnexion n'attend rien
  it("does nothing for an account whose deletion is not in progress", async () => {
    const { deps, steps } = doubles();

    await finishPendingDeletion(deps, userId);

    expect(steps).toEqual([]);
  });

  // Une reconnexion pendant un effacement interrompu le termine ; un échec remonte et arrête la connexion
  it("finishes an interrupted deletion before a reconnection, and lets a failure stop it", async () => {
    const { deps, pending } = doubles({ purgeTraces: 2 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccount(deps, { userId, trigger: "button" });

    await expect(finishPendingDeletion(deps, userId)).rejects.toThrow("Redis a coupé");
    expect(pending.size).toBe(1);
    await finishPendingDeletion(deps, userId);

    expect(pending.size).toBe(0);
  });
});

describe("the subscriptions Twitch keeps for the account (CDC §8, JOURNAL 2026-11-02)", () => {
  // Quel que soit le déclencheur, les abonnements partent pendant que l'effacement est encore en cours, après les traces
  it("removes them for every trigger, while the deletion is still in progress", async () => {
    for (const trigger of ["button", "twitch", "contact", "inactivity"] as const) {
      const { deps, subscriptions, pending } = doubles();

      await deleteAccount(deps, { userId, trigger });

      expect(subscriptions).toEqual([{ userId, wasPending: true }]);
      expect(pending.size).toBe(0);
    }
  });

  // Quand Twitch ne répond pas, tout le reste est déjà effacé, l'effacement reste en cours, et la reprise retire les abonnements
  it("erases everything else first when Twitch fails, keeps the deletion in progress, and the resume removes them", async () => {
    const { deps, steps, pending, proofs, subscriptions } = doubles({ subscriptions: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await deleteAccount(deps, { userId, trigger: "twitch" });

    expect(result).toEqual({ ok: false, error: "failed" });
    expect(steps).toContain("purgeAccountKeys");
    expect(proofs).toHaveLength(1);
    expect(subscriptions).toEqual([]);
    expect([...pending.keys()]).toEqual([userId]);

    await resumePendingDeletions(deps);

    expect(subscriptions).toEqual([{ userId, wasPending: true }]);
    expect(pending.size).toBe(0);
    // Convex dédouble une preuve par `runId` : la reprise repasse avec celui du premier passage.
    expect(new Set(proofs.map((proof) => ("runId" in proof ? proof.runId : null)))).toEqual(
      new Set(["run-1"]),
    );
  });
});

describe("beginAccountDeletion (CDC §8, JOURNAL 2026-11-02)", () => {
  // Le compte est inscrit avant qu'on rende la main, et la routine tourne ensuite sans qu'on l'attende
  it("registers the account before it hands back, and runs the routine without waiting for it", async () => {
    const { deps, pending, steps } = doubles();
    let release = (): void => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const purgeTraces = deps.purge.purgeTraces;
    deps.purge.purgeTraces = async (id) => {
      await blocked;
      return purgeTraces(id);
    };

    const began = await beginAccountDeletion(deps, { userId, trigger: "twitch" });

    expect(began.ok).toBe(true);
    expect([...pending.keys()]).toEqual([userId]);
    expect(steps).not.toContain("finish");
    release();
    if (began.ok) expect(await began.value.done).toEqual({ ok: true, value: undefined });
    expect(pending.size).toBe(0);
  });

  // Quand l'inscription échoue, rien d'autre ne part : le compte reste entier, et l'erreur est dite
  it("says failed and touches nothing else when the registration fails", async () => {
    const { deps, steps, pending } = doubles();
    deps.purge.begin = async () => {
      throw new Error("Redis a coupé");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const began = await beginAccountDeletion(deps, { userId, trigger: "button" });

    expect(began).toEqual({ ok: false, error: "failed" });
    expect(steps).toEqual([]);
    expect(pending.size).toBe(0);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(userId);
  });

  // Une exécution qui échoue après l'inscription dit `failed` dans `done`, mais l'effacement reste acquis : la reprise le finit
  it("keeps a registered deletion acquired when the run fails afterwards", async () => {
    const { deps, pending } = doubles({ purgeTraces: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const began = await beginAccountDeletion(deps, { userId, trigger: "button" });

    expect(began.ok).toBe(true);
    if (began.ok) expect(await began.value.done).toEqual({ ok: false, error: "failed" });
    expect([...pending.keys()]).toEqual([userId]);
  });
});

describe("two requests for the same account at once (CDC §8, JOURNAL 2026-11-02)", () => {
  // Un double clic : une seule exécution de la routine, une seule preuve, et les deux demandes aboutissent
  it("runs the routine once, writes one proof, and both requests succeed", async () => {
    const { deps, steps, proofs, pending } = doubles();

    const [first, second] = await Promise.all([
      deleteAccount(deps, { userId, trigger: "button" }),
      deleteAccount(deps, { userId, trigger: "button" }),
    ]);

    expect([first.ok, second.ok]).toEqual([true, true]);
    expect(steps.filter((step) => step === "purgeTraces")).toHaveLength(1);
    expect(proofs).toHaveLength(1);
    expect(pending.size).toBe(0);
  });

  // La reprise de la minute qui tombe pendant une exécution la rejoint au lieu d'en lancer une seconde
  it("lets the resume of the minute join a run in progress instead of starting a second one", async () => {
    const { deps, steps } = doubles();
    const purgeTraces = deps.purge.purgeTraces;
    let release = (): void => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    deps.purge.purgeTraces = async (id) => {
      await blocked;
      return purgeTraces(id);
    };

    const running = deleteAccount(deps, { userId, trigger: "button" });
    await vi.waitFor(() => expect(steps).toContain("purgeOwnedCanvases canvas-active,canvas-archive"));
    const resuming = resumePendingDeletions(deps);
    release();
    await Promise.all([running, resuming]);

    expect(steps.filter((step) => step === "purgeTraces")).toHaveLength(1);
    expect(steps.filter((step) => step === "finish")).toHaveLength(1);
  });

  // Son empreinte de session part dans Convex dès l'effacement inscrit, avec l'heure du début : Redis peut la perdre, Convex la garde
  it("keeps the session fingerprint of the account in Convex, never its identifier", async () => {
    const { deps, kept } = doubles();

    await deleteAccount(deps, { userId, trigger: "button" });

    expect(kept).toEqual([{ fingerprint: `fingerprint-of-${userId}`, deletedAt: now }]);
  });

  // Redis a perdu les empreintes : la reprise les relit dans Convex, d'au plus 31 jours, et les remet avec l'heure d'aujourd'hui
  it("puts the fingerprints back from Convex when Redis lost them, once", async () => {
    const { deps, steps, restored, loseMarks } = doubles();
    loseMarks();

    await resumePendingDeletions(deps);
    await resumePendingDeletions(deps);

    expect(steps.filter((step) => step.startsWith("syncDeletedAccounts"))).toEqual([
      `syncDeletedAccounts ${now - DELETED_ACCOUNT_TTL_SECONDS * 1000}`,
    ]);
    expect(restored).toEqual([{ marks: [], nowMs: now }]);
  });

  // Sans perte, la reprise ne coûte qu'une lecture de Redis : Convex n'est pas appelé
  it("does not call Convex for the fingerprints when Redis still has them", async () => {
    const { deps, steps } = doubles();

    await resumePendingDeletions(deps);

    expect(steps.some((step) => step.startsWith("syncDeletedAccounts"))).toBe(false);
  });

  // Convex qui coupe ne bloque pas la reprise des effacements en cours
  it("still resumes the deletions in progress when the fingerprints cannot be put back", async () => {
    const { deps, steps, pending, loseMarks } = doubles({ purgeTraces: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccount(deps, { userId, trigger: "button" });
    loseMarks();
    deps.durable.syncDeletedAccounts = async () => {
      throw new Error("Convex a coupé");
    };

    await resumePendingDeletions(deps);

    expect(steps).toContain("finish");
    expect(pending.size).toBe(0);
  });
});

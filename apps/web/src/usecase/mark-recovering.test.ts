import type { RecoveryMarks } from "@liveplace/domain/ports";
import { describe, expect, it, vi } from "vitest";
import { markRecoveringIfLost } from "./mark-recovering";

// Redis dit si le canvas vit ; Convex dit s'il garde une sauvegarde. Chacun note ce qu'on lui demande.
const doubles = (options: { isLive?: boolean; hasSnapshot?: boolean; failsAt?: "redis" | "convex" } = {}) => {
  const calls: string[] = [];
  const marks: RecoveryMarks = {
    isCanvasLive: async (canvasId) => {
      calls.push(`isCanvasLive ${canvasId}`);
      if (options.failsAt === "redis") throw new Error("Redis a coupé");
      return options.isLive ?? true;
    },
    markRecovering: async (canvasId) => {
      calls.push(`markRecovering ${canvasId}`);
    },
  };
  const recovery = {
    hasSnapshot: async (canvasId: string) => {
      calls.push(`hasSnapshot ${canvasId}`);
      if (options.failsAt === "convex") throw new Error("Convex a coupé");
      return options.hasSnapshot ?? false;
    },
  };
  return { marks, recovery, calls };
};

describe("markRecoveringIfLost (Écart §4.2, JOURNAL 2026-10-08)", () => {
  // Un canvas qui vit : un `EXISTS` sur Redis, jamais Convex, jamais de marque
  it("asks Redis only, and marks nothing, for a canvas that lives", async () => {
    const { marks, recovery, calls } = doubles({ isLive: true });

    await markRecoveringIfLost({ marks, recovery }, "canvas-1");

    expect(calls).toEqual(["isCanvasLive canvas-1"]);
  });

  // Un canvas que Redis a perdu et dont ce scope garde une sauvegarde : la page le dit « en récupération » sans attendre le worker
  it("marks a canvas Redis lost and this scope holds a save of, without waiting for the worker", async () => {
    const { marks, recovery, calls } = doubles({ isLive: false, hasSnapshot: true });

    await markRecoveringIfLost({ marks, recovery }, "canvas-1");

    expect(calls).toEqual(["isCanvasLive canvas-1", "hasSnapshot canvas-1", "markRecovering canvas-1"]);
  });

  // Un canvas absent sans sauvegarde (jamais dessiné) n'est pas en récupération : il n'y a rien à remettre
  it("marks nothing for a canvas that is absent and has no save: nothing to bring back", async () => {
    const { marks, recovery, calls } = doubles({ isLive: false, hasSnapshot: false });

    await markRecoveringIfLost({ marks, recovery }, "canvas-1");

    expect(calls).toEqual(["isCanvasLive canvas-1", "hasSnapshot canvas-1"]);
  });

  // Sans scope de sauvegarde (local, `off`), le rendu d'une page est exactement celui d'avant : aucune lecture
  it("reads nothing when there is no save scope", async () => {
    const { marks, calls } = doubles({ isLive: false });

    await markRecoveringIfLost({ marks, recovery: undefined }, "canvas-1");

    expect(calls).toEqual([]);
  });

  // Une panne de Redis ou de Convex ne casse jamais la page : elle est journalisée
  it("never breaks the page when Redis or Convex fails: the failure is logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const redisFails = doubles({ failsAt: "redis" });
    const convexFails = doubles({ isLive: false, failsAt: "convex" });

    await markRecoveringIfLost(redisFails, "canvas-1");
    await markRecoveringIfLost(convexFails, "canvas-1");

    expect(logged).toHaveBeenCalledTimes(2);
    expect(convexFails.calls).not.toContain("markRecovering canvas-1");
    logged.mockRestore();
  });
});

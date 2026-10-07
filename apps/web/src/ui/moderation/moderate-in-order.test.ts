import { describe, expect, it } from "vitest";
import type { ModerationAction, RequestResult } from "../../state/canvas-store";
import { moderateInOrder } from "./moderate-in-order";

const clear = (placementId: string): ModerationAction => ({
  action: "clearPlacement",
  target: "troll",
  placementId,
});

const settled = (cells: number): RequestResult<{ cells: number }> => ({ ok: true, value: { cells } });

describe("moderating several actions in order (JOURNAL 2026-10-07)", () => {
  // Quand une action n'a pas fini, le système n'envoie pas la suivante
  it("sends the next action only once the previous one is done", async () => {
    const events: string[] = [];
    const canvas = {
      moderate: async (action: ModerationAction) => {
        const id = action.action === "clearPlacement" ? action.placementId : action.action;
        events.push(`start ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end ${id}`);
        return settled(1);
      },
    };

    await moderateInOrder(canvas, [clear("pone00001"), clear("ptwo00001")]);

    expect(events).toEqual(["start pone00001", "end pone00001", "start ptwo00001", "end ptwo00001"]);
  });

  // Si une action échoue, alors le système s'arrête et rend cet échec sans envoyer les suivantes
  it("stops at the first failure and gives it back, sending nothing after", async () => {
    const sent: ModerationAction[] = [];
    const results = [settled(1), { ok: false, error: "forbidden" } as const, settled(1)];
    const canvas = {
      moderate: async (action: ModerationAction) => {
        sent.push(action);
        return results[sent.length - 1] ?? settled(0);
      },
    };

    const result = await moderateInOrder(canvas, [
      clear("pone00001"),
      clear("ptwo00001"),
      clear("pthree001"),
    ]);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(sent).toEqual([clear("pone00001"), clear("ptwo00001")]);
  });

  // Quand tout passe, le système rend la somme des cases changées
  it("gives the sum of the changed cells once everything is done", async () => {
    const counts = [3, 4];
    const canvas = { moderate: async () => settled(counts.shift() ?? 0) };

    expect(await moderateInOrder(canvas, [clear("pone00001"), clear("ptwo00001")])).toEqual(settled(7));
  });
});

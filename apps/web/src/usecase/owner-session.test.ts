import type { Session } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withOwnerSession } from "./owner-session";

const session: Session = { userId: "owner-1", login: "owner1", displayName: "Owner 1" };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => logged.mockRestore());

describe("withOwnerSession (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Fait agir l'opération pour le propriétaire du cookie, et pour lui seul
  it("runs the operation for the owner of the cookie, and for that owner only", async () => {
    const verifier: SessionVerifier = {
      verify: async (cookie) => (cookie === "lp_session=good" ? session : null),
    };
    const run = vi.fn(async () => ({ ok: true as const, value: "done" }));

    expect(await withOwnerSession(verifier, "lp_session=good", run)).toEqual({ ok: true, value: "done" });

    expect(run).toHaveBeenCalledExactlyOnceWith("owner-1");
  });

  // Sans cookie, avec un cookie invalide ou une vérification qui échoue : refus, et l'opération ne part jamais
  it("refuses without a cookie, with an invalid one, or when the check fails: the operation never starts", async () => {
    const run = vi.fn(async () => ({ ok: true as const, value: "done" }));
    const failing: SessionVerifier = {
      verify: async () => {
        throw new Error("clé illisible");
      },
    };
    const picky: SessionVerifier = {
      verify: async (cookie) => (cookie === "lp_session=good" ? session : null),
    };

    expect(await withOwnerSession(picky, undefined, run)).toEqual({ ok: false, error: "unauthenticated" });
    expect(await withOwnerSession(picky, "lp_session=forged", run)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(await withOwnerSession(failing, "lp_session=good", run)).toEqual({
      ok: false,
      error: "unauthenticated",
    });

    expect(run).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
  });

  // Rend tel quel le refus de l'opération
  it("passes the operation's refusal on as it is", async () => {
    const verifier: SessionVerifier = { verify: async () => session };

    expect(
      await withOwnerSession(verifier, "x", async () => ({ ok: false as const, error: "busy" as const })),
    ).toEqual({
      ok: false,
      error: "busy",
    });
  });
});

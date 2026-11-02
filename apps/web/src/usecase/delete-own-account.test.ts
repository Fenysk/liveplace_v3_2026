import type { Session } from "@liveplace/domain";
import type { Result } from "@liveplace/shared";
import { describe, expect, it } from "vitest";
import type { BeganDeletion, DeleteAccountRequest } from "./delete-account";
import { type DeleteOwnAccountDeps, deleteOwnAccount } from "./delete-own-account";

const session: Session = { userId: "1234", login: "fenysk", displayName: "Fenysk" };
const never = new Promise<never>(() => undefined);

type Setup = {
  session?: Session | null;
  begin?: Result<BeganDeletion, "failed">;
  waitMs?: number;
};

// Des doubles : la session du cookie, et l'inscription de l'effacement (ce que le web écrit dans `deletions:pending`).
const setup = (options: Setup = {}) => {
  const requests: DeleteAccountRequest[] = [];
  const cookies: (string | undefined)[] = [];
  const deps: DeleteOwnAccountDeps = {
    verifier: {
      verify: async (cookie) => {
        cookies.push(cookie);
        return options.session === undefined ? session : options.session;
      },
    },
    beginDeletion: async (request) => {
      requests.push(request);
      return options.begin ?? { ok: true, value: { done: Promise.resolve({ ok: true, value: undefined }) } };
    },
    waitMs: options.waitMs ?? 5_000,
  };
  return { deps, requests, cookies };
};

describe("deleteOwnAccount, the button of My account (CDC §8, JOURNAL 2026-11-02)", () => {
  // Sans session, rien n'est inscrit : un invité ou un compte déjà supprimé n'efface personne
  it("refuses without a session, and registers nothing", async () => {
    const { deps, requests } = setup({ session: null });

    expect(await deleteOwnAccount(deps, undefined)).toEqual({ ok: false, error: "unauthenticated" });
    expect(requests).toEqual([]);
  });

  // Le compte effacé est celui du cookie, avec le déclencheur du bouton
  it("deletes the account of the cookie, with the button as trigger", async () => {
    const { deps, requests, cookies } = setup();

    expect(await deleteOwnAccount(deps, "lp_session=abc")).toEqual({ ok: true, value: undefined });

    expect(cookies).toEqual(["lp_session=abc"]);
    expect(requests).toEqual([{ userId: "1234", trigger: "button" }]);
  });

  // Une erreur avant l'inscription se dit, et le compte reste : rien n'a été acquis
  it("says failed when nothing could be registered, so the account stays", async () => {
    const { deps } = setup({ begin: { ok: false, error: "failed" } });

    expect(await deleteOwnAccount(deps, "lp_session=abc")).toEqual({ ok: false, error: "failed" });
  });

  // Dès l'inscription, l'effacement est acquis : la réponse part au bout du délai même si la routine tourne encore
  it("answers success after the wait even when the routine is still running", async () => {
    const { deps } = setup({ begin: { ok: true, value: { done: never } }, waitMs: 20 });
    const startedAt = Date.now();

    expect(await deleteOwnAccount(deps, "lp_session=abc")).toEqual({ ok: true, value: undefined });

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  // Une routine qui échoue après l'inscription répond succès aussi : la reprise la finit
  it("answers success when the routine fails after the registration, since the resume finishes it", async () => {
    const { deps } = setup({
      begin: { ok: true, value: { done: Promise.resolve({ ok: false, error: "failed" }) } },
    });

    expect(await deleteOwnAccount(deps, "lp_session=abc")).toEqual({ ok: true, value: undefined });
  });

  // Une routine rapide n'attend pas le délai : la réponse part dès qu'elle a fini
  it("does not wait for the whole delay when the routine is quick", async () => {
    const { deps } = setup({ waitMs: 5_000 });
    const startedAt = Date.now();

    await deleteOwnAccount(deps, "lp_session=abc");

    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});

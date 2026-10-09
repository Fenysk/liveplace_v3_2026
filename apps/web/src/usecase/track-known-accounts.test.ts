import type { AccountList } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackKnownAccounts } from "./track-known-accounts";

afterEach(() => {
  vi.restoreAllMocks();
});

// Des doubles : les comptes connus, ce qui est suivi dans l'ordre, et chaque attente entre deux comptes.
const setup = (options: { userIds?: string[]; isListFailing?: boolean; failingOn?: string } = {}) => {
  const tracked: string[] = [];
  const waits: number[] = [];
  const accounts: AccountList = {
    listAccountIds: async () => {
      if (options.isListFailing) throw new Error("Redis ne répond pas");
      return options.userIds ?? [];
    },
  };
  const tracker = {
    track: (userId: string) => {
      if (userId === options.failingOn) throw new Error("suivi impossible");
      tracked.push(userId);
    },
  };
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { deps: { accounts, tracker, wait }, tracked, waits };
};

describe("following every known account at the web's start (Écart §4, JOURNAL 2026-10-07)", () => {
  // Suit chaque compte connu, dans l'ordre, avec une attente entre deux : Twitch ne reçoit pas tous les appels d'un coup
  it("tracks each known account in order, with a wait after each so Twitch is not hit all at once", async () => {
    const { deps, tracked, waits } = setup({ userIds: ["1", "2", "3"] });

    await trackKnownAccounts(deps);

    expect(tracked).toEqual(["1", "2", "3"]);
    expect(waits).toHaveLength(3);
    expect(waits.every((ms) => ms >= 100)).toBe(true);
  });

  // Sans compte connu, il n'y a rien à suivre et rien à attendre
  it("has nothing to track and nothing to wait for without a known account", async () => {
    const { deps, tracked, waits } = setup();

    await trackKnownAccounts(deps);

    expect(tracked).toEqual([]);
    expect(waits).toEqual([]);
  });

  // Quand la liste des comptes échoue, l'échec est journalisé et rien n'est suivi : le démarrage n'en souffre pas
  it("logs a failure of the account list and tracks nothing, without ever throwing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps, tracked } = setup({ isListFailing: true });

    await expect(trackKnownAccounts(deps)).resolves.toBeUndefined();

    expect(tracked).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  // Un compte dont le suivi échoue est journalisé, et les suivants sont suivis quand même
  it("logs an account whose tracking fails, and still tracks the following ones", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps, tracked } = setup({ userIds: ["1", "2", "3"], failingOn: "2" });

    await trackKnownAccounts(deps);

    expect(tracked).toEqual(["1", "3"]);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

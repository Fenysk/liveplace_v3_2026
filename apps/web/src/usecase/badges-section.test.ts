import { DEVELOPER_USER_ID, type Session, type User } from "@liveplace/domain";
import type {
  DonationLinkRefusal,
  SessionVerifier,
  SupportSummary,
  WaitingDonation,
} from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import { describe, expect, it, vi } from "vitest";
import {
  getBadgesReport,
  getMySupportTitle,
  linkWaitingDonation,
  withDeveloperSession,
} from "./badges-section";

const NOW = Date.UTC(2026, 10, 3, 12);
const DAY = 24 * 3600 * 1000;

const mathis: User = {
  userId: "1234",
  login: "mathis_b",
  displayName: "Mathis_B",
  avatarUrl: "https://avatar",
};

describe("getMySupportTitle (Mon compte, CDC des badges §3)", () => {
  // Le titre suit le cumul à vie de tous ses dons, expiré ou non : Mon compte le montre toujours
  it("gives the title of the lifetime total, whatever the date of the last donation", async () => {
    const getSupport = async (): Promise<SupportSummary> => ({ lifetimeCents: 1500, lastDonatedAt: 1 });
    expect(await getMySupportTitle({ getSupport }, "1234")).toEqual({ ok: true, value: "regular" });
  });

  // Aucun don relié : aucun titre
  it("gives no title without a linked donation", async () => {
    expect(await getMySupportTitle({ getSupport: async () => null }, "1234")).toEqual({
      ok: true,
      value: null,
    });
  });
});

describe("getBadgesReport (section Badges, CDC des badges §4)", () => {
  const waiting: WaitingDonation[] = [
    { donationId: "d1", donatedAt: NOW - DAY, kofiName: "Camille R.", email: "camille@example.com" },
  ];

  // Les titulaires : les comptes dont le dernier don + 12 mois n'est pas passé ; la lecture part du début de la fenêtre utile
  it("counts the accounts whose Support has not expired, reading from the start of the useful window", async () => {
    const getLastDonationDates = vi.fn(async () => [NOW - 10 * DAY, NOW - 400 * DAY, NOW - 364 * DAY]);

    const report = await getBadgesReport(
      { getLastDonationDates, listWaitingDonations: async () => waiting },
      NOW,
    );

    expect(report).toEqual({ ok: true, value: { holders: 2, waiting } });
    expect(getLastDonationDates).toHaveBeenCalledWith(NOW - 366 * DAY);
  });

  // Aucun titulaire, aucun don en attente : des zéros, pas une erreur
  it("gives zero holders and an empty list when nothing was donated", async () => {
    expect(
      await getBadgesReport(
        { getLastDonationDates: async () => [], listWaitingDonations: async () => [] },
        NOW,
      ),
    ).toEqual({ ok: true, value: { holders: 0, waiting: [] } });
  });

  // Jamais de montant dans ce qui part vers la page
  it("sends no amount", async () => {
    const report = await getBadgesReport(
      { getLastDonationDates: async () => [], listWaitingDonations: async () => waiting },
      NOW,
    );
    expect(JSON.stringify(report)).not.toMatch(/amount|cents/i);
  });
});

describe("linkWaitingDonation (lien à la main, CDC des badges §4)", () => {
  const setup = (linked: Result<User, DonationLinkRefusal>) => {
    const written: { user: User; support: unknown }[] = [];
    const deps = {
      donations: {
        linkDonation: async () => linked,
        getSupport: async (): Promise<SupportSummary> => ({ lifetimeCents: 300, lastDonatedAt: NOW }),
      },
      redis: {
        setUser: async (user: User, support?: unknown) => {
          written.push({ user, support });
        },
      },
    };
    return { deps, written };
  };

  // Relier réussit : le miroir du compte prend le titre tout de suite, par le même écrivain que la connexion
  it("writes the mirror of the account the donation was linked to", async () => {
    const { deps, written } = setup({ ok: true, value: mathis });

    expect(await linkWaitingDonation(deps, "d1", "mathis_b")).toEqual({ ok: true, value: undefined });

    expect(written).toEqual([
      { user: mathis, support: { title: "supporter", endsAt: Date.UTC(2027, 10, 3, 12) } },
    ]);
  });

  // Un pseudo inconnu : le refus remonte, le miroir n'est pas touché
  it("gives the refusal back and writes nothing for a login no account carries", async () => {
    const { deps, written } = setup({ ok: false, error: "unknown_account" });

    expect(await linkWaitingDonation(deps, "d1", "personne")).toEqual({
      ok: false,
      error: "unknown_account",
    });

    expect(written).toEqual([]);
  });
});

describe("withDeveloperSession (le rôle se vérifie côté serveur, §10.3)", () => {
  const verifierOf = (session: Session | null): SessionVerifier => ({ verify: async () => session });
  const sessionOf = (userId: string): Session => ({ userId, login: "login", displayName: "Name" });
  const run = vi.fn(async (): Promise<Result<number, "never">> => ({ ok: true, value: 7 }));

  // Le développeur passe : son code s'exécute
  it("runs for the developer", async () => {
    run.mockClear();
    expect(await withDeveloperSession(verifierOf(sessionOf(DEVELOPER_USER_ID)), "cookie", run)).toEqual({
      ok: true,
      value: 7,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  // Tout autre compte est refusé, et rien ne s'exécute
  it("refuses any other account and runs nothing", async () => {
    run.mockClear();
    expect(await withDeveloperSession(verifierOf(sessionOf("42")), "cookie", run)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(run).not.toHaveBeenCalled();
  });

  // Sans session : non connecté, et rien ne s'exécute
  it("refuses a visitor with no session", async () => {
    run.mockClear();
    expect(await withDeveloperSession(verifierOf(null), undefined, run)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(run).not.toHaveBeenCalled();
  });
});

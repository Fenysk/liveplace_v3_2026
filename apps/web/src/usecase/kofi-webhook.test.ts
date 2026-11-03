import type { User } from "@liveplace/domain";
import type { DonationOutcome, KofiDonation, KofiWebhook, SupportSummary } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { receiveKofiWebhook } from "./kofi-webhook";

const now = 1_788_000_000_000;

const donation: KofiDonation = {
  messageId: "m-1",
  amountCents: 300,
  currency: "EUR",
  donatedAt: Date.UTC(2026, 10, 3, 12, 1, 22),
  email: "donor@example.com",
  kofiName: "Un donateur",
};

const mathis: User = {
  userId: "1234",
  login: "mathis_b",
  displayName: "Mathis_B",
  avatarUrl: "https://avatar",
};
const summary: SupportSummary = { lifetimeCents: 300, lastDonatedAt: donation.donatedAt };

// Le webhook rend ce qu'on lui dit (le jeton et le schéma se testent dans `infra/kofi.test.ts`), et note ce qu'il a reçu. Le
// stockage garde les dons dans une liste et dédoublonne par message, comme Convex ; `linkedTo` est le compte qui porte l'e-mail.
const setup = (answer: ReturnType<KofiWebhook["read"]>, linkedTo?: User) => {
  const received: { body: string; nowMs: number }[] = [];
  const recorded: KofiDonation[] = [];
  const mirrors: { user: User; support: { title: string; endsAt: number } | null | undefined }[] = [];
  const webhook: KofiWebhook = {
    read: (body, nowMs) => {
      received.push({ body, nowMs });
      return answer;
    },
  };
  const donations = {
    recordDonation: async (given: KofiDonation): Promise<DonationOutcome> => {
      if (recorded.some(({ messageId }) => messageId === given.messageId))
        return linkedTo ? { kind: "duplicate", user: linkedTo } : { kind: "duplicate" };
      recorded.push(given);
      return linkedTo ? { kind: "linked", user: linkedTo } : { kind: "unlinked" };
    },
    getSupport: async (userId: string) => (userId === linkedTo?.userId ? summary : null),
  };
  const redis = {
    setUser: async (user: User, support?: { title: string; endsAt: number } | null) => {
      mirrors.push({ user, support });
    },
  };
  return { received, recorded, mirrors, deps: { webhook, now: () => now, donations, redis } };
};

const donating = { ok: true, value: { kind: "donation", donation } } as const;

describe("receiveKofiWebhook (JOURNAL 2026-11-03)", () => {
  // Un don vérifié est enregistré, et Ko-fi reçoit son 200 ; le webhook lit le corps tel quel, à l'heure du web
  it("records a verified donation and answers 200", async () => {
    const { deps, recorded, received } = setup(donating);

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 200 });

    expect(recorded).toEqual([donation]);
    expect(received).toEqual([{ body: "data=corps", nowMs: now }]);
  });

  // Le don relié écrit le miroir du compte à la réception, avec son nom et son titre : le badge n'attend pas une connexion
  it("writes the mirror of the linked account as the donation arrives", async () => {
    const { deps, mirrors } = setup(donating, mathis);

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 200 });

    expect(mirrors).toEqual([
      { user: mathis, support: { title: "supporter", endsAt: Date.UTC(2027, 10, 3, 12, 1, 22) } },
    ]);
  });

  // Un don qui n'a pas de compte n'écrit aucun miroir : il attend dans les dons non reliés
  it("writes no mirror for a donation that waits for an account", async () => {
    const { deps, mirrors } = setup(donating);

    await receiveKofiWebhook(deps, "data=corps");

    expect(mirrors).toEqual([]);
  });

  // Ko-fi renvoie le message tant qu'il n'a pas son 200 : le renvoi d'un don relié réécrit le miroir, sans second don
  it("rewrites the mirror when Ko-fi sends a linked donation again, and adds no donation", async () => {
    const { deps, recorded, mirrors } = setup(donating, mathis);

    await receiveKofiWebhook(deps, "data=corps");
    await receiveKofiWebhook(deps, "data=corps");

    expect(recorded).toHaveLength(1);
    expect(mirrors).toHaveLength(2);
  });

  // Une panne de Redis après Convex : la route répond une erreur, et le renvoi de Ko-fi réécrit le miroir
  it("lets a failure of the mirror rise so that Ko-fi sends the message again", async () => {
    const { deps } = setup(donating, mathis);
    const failing = {
      ...deps,
      redis: {
        setUser: async (): Promise<void> => {
          throw new Error("Redis a coupé");
        },
      },
    };

    await expect(receiveKofiWebhook(failing, "data=corps")).rejects.toThrow("Redis a coupé");
  });

  // Sans variable d'environnement : 503 et rien d'enregistré
  it("answers 503 and records nothing when no secret is set", async () => {
    const { deps, recorded } = setup({ ok: false, error: "unconfigured" });

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 503 });

    expect(recorded).toEqual([]);
  });

  // Un mauvais jeton : 401 et rien d'enregistré
  it("answers 401 and records nothing for a wrong token", async () => {
    const { deps, recorded } = setup({ ok: false, error: "unauthorized" });

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 401 });

    expect(recorded).toEqual([]);
  });

  // Un corps illisible : 400
  it("answers 400 for a body that is not Ko-fi's", async () => {
    const { deps, recorded } = setup({ ok: false, error: "invalid" });

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 400 });

    expect(recorded).toEqual([]);
  });

  // Un type qui n'est pas un don : 200 pour que Ko-fi cesse de renvoyer, rien d'enregistré
  it("answers 200 and records nothing for a type that is not a donation", async () => {
    const { deps, recorded, mirrors } = setup({ ok: true, value: { kind: "ignored" } }, mathis);

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 200 });

    expect(recorded).toEqual([]);
    expect(mirrors).toEqual([]);
  });

  // Ko-fi renvoie le même message tant qu'il n'a pas son 200 : le doublon répond 200 et n'ajoute rien
  it("answers 200 again for a message already received, without a second donation", async () => {
    const { deps, recorded } = setup(donating);

    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 200 });
    expect(await receiveKofiWebhook(deps, "data=corps")).toEqual({ status: 200 });

    expect(recorded).toHaveLength(1);
  });

  // Une panne de Convex remonte : la route répond une erreur, Ko-fi renverra
  it("lets a failure of the store rise so that Ko-fi sends the message again", async () => {
    const { deps } = setup(donating);
    const failing = {
      ...deps,
      donations: {
        ...deps.donations,
        recordDonation: async (): Promise<DonationOutcome> => {
          throw new Error("Convex a coupé");
        },
      },
    };

    await expect(receiveKofiWebhook(failing, "data=corps")).rejects.toThrow("Convex a coupé");
  });
});

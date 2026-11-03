import type { DonationOutcome, KofiDonation, KofiWebhook } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KOFI_BODY_MAX_BYTES, kofiWebhookResponse } from "./kofi-webhook-response";

const donation: KofiDonation = {
  messageId: "m-1",
  amountCents: 300,
  currency: "EUR",
  donatedAt: 1_788_000_000_000,
  email: "donor@example.com",
  kofiName: "Un donateur",
};

// Ko-fi poste un formulaire, sans cookie ni origine.
const post = (body: string) =>
  new Request("https://liveplace.tv/kofi/webhook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

// Le webhook rend ce qu'on lui dit (le jeton et le schéma se testent dans `infra/kofi.test.ts`), et note le corps reçu.
const setup = (
  answer: ReturnType<KofiWebhook["read"]> = { ok: true, value: { kind: "donation", donation } },
) => {
  const bodies: string[] = [];
  const recorded: KofiDonation[] = [];
  const deps = {
    webhook: {
      read: (body: string) => {
        bodies.push(body);
        return answer;
      },
    },
    now: () => 1_788_000_000_000,
    donations: {
      recordDonation: async (given: KofiDonation): Promise<DonationOutcome> => {
        recorded.push(given);
        return { kind: "unlinked" };
      },
      getSupport: async () => null,
    },
    redis: { setUser: async () => undefined },
  };
  return { deps, recorded, bodies };
};

afterEach(() => vi.restoreAllMocks());

describe("kofiWebhookResponse (JOURNAL 2026-11-03)", () => {
  // Un don, sans session ni origine : 200, le don est enregistré, le webhook a lu le corps décodé
  it("answers 200 and records a donation posted without cookie or origin", async () => {
    const { deps, recorded, bodies } = setup();

    const response = await kofiWebhookResponse(deps, post("data=%7B%7D"));

    expect(response.status).toBe(200);
    expect(recorded).toEqual([donation]);
    expect(bodies).toEqual(["data=%7B%7D"]);
  });

  // Sans variable : 503. Mauvais jeton : 401. Corps illisible : 400. Rien n'est enregistré
  it("answers 503 without a secret, 401 for a wrong token and 400 for an unreadable body", async () => {
    const statuses = [];
    for (const error of ["unconfigured", "unauthorized", "invalid"] as const) {
      const { deps, recorded } = setup({ ok: false, error });
      statuses.push((await kofiWebhookResponse(deps, post("data=%7B%7D"))).status);
      expect(recorded).toEqual([]);
    }

    expect(statuses).toEqual([503, 401, 400]);
  });

  // Un type ignoré : 200, rien d'enregistré
  it("answers 200 and records nothing for an ignored type", async () => {
    const { deps, recorded } = setup({ ok: true, value: { kind: "ignored" } });

    expect((await kofiWebhookResponse(deps, post("data=%7B%7D"))).status).toBe(200);

    expect(recorded).toEqual([]);
  });

  // Un corps de plus de 16 Ko, annoncé ou non, est refusé sans être lu : 413, le webhook n'est pas appelé
  it("answers 413 for a body over 16 KB without reading it", async () => {
    const { deps, bodies } = setup();

    expect((await kofiWebhookResponse(deps, post("x".repeat(KOFI_BODY_MAX_BYTES + 1)))).status).toBe(413);

    const chunks = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(KOFI_BODY_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const unannounced = new Request("https://liveplace.tv/kofi/webhook", {
      method: "POST",
      body: chunks,
      duplex: "half",
    } as RequestInit);
    expect((await kofiWebhookResponse(deps, unannounced)).status).toBe(413);
    expect(bodies).toEqual([]);
  });

  // Un corps de 16 Ko pile passe
  it("takes a body of exactly 16 KB", async () => {
    const { deps, bodies } = setup();

    expect((await kofiWebhookResponse(deps, post("x".repeat(KOFI_BODY_MAX_BYTES)))).status).toBe(200);

    expect(bodies[0]?.length).toBe(KOFI_BODY_MAX_BYTES);
  });

  // Une panne de Convex : 500, Ko-fi renvoie ; le journal ne cite ni l'erreur ni ce que Ko-fi a envoyé
  it("answers 500 when the store fails and logs neither the error nor what Ko-fi sent", async () => {
    const { deps } = setup();
    const failing = {
      ...deps,
      donations: {
        recordDonation: async (): Promise<DonationOutcome> => {
          throw new Error("Convex a coupé pour donor@example.com");
        },
        getSupport: async () => null,
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await kofiWebhookResponse(failing, post("data=donor%40example.com"))).status).toBe(500);

    const text = JSON.stringify(logged.mock.calls);
    expect(text).not.toContain("donor");
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

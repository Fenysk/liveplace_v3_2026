import type { HealthProbe } from "@liveplace/domain/ports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHealthCheck, HEALTH_PART_TIMEOUT_MS } from "./check-health";

type Part = keyof HealthProbe;

const PARTS: Part[] = ["redis", "gateway", "worker"];

// Une sonde dont chaque partie répond vrai, sauf ce que le test règle.
const probeOf = (overrides: Partial<HealthProbe> = {}): HealthProbe => ({
  redis: async () => true,
  gateway: async () => true,
  worker: async () => true,
  ...overrides,
});

const neverAnswers = (): Promise<boolean> => new Promise(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkHealth (JOURNAL 2026-11-03)", () => {
  // Quand Redis, le gateway et le worker répondent, la réponse est 200
  it("answers 200 when Redis, the gateway and the worker all answer", async () => {
    const answer = await createHealthCheck(probeOf())();

    expect(answer).toEqual({ status: 200 });
  });

  // Si une partie répond faux, seule, la réponse est 503 et ne nomme qu'elle
  it.each(PARTS)("answers 503 naming only %s when it alone does not answer", async (part) => {
    const answer = await createHealthCheck(probeOf({ [part]: async () => false }))();

    expect(answer).toEqual({ status: 503, failed: [part] });
  });

  // Si une partie échoue, seule, la réponse est 503 et ne cite rien de l'erreur : ni message, ni hôte
  it.each(PARTS)("answers 503 naming only %s when it alone fails, without saying why", async (part) => {
    const probe = probeOf({
      [part]: async () => {
        throw new Error("connect ECONNREFUSED redis://secret-host:6379");
      },
    });

    const answer = await createHealthCheck(probe)();

    expect(answer).toEqual({ status: 503, failed: [part] });
  });

  // Si plusieurs parties échouent, la réponse les nomme toutes, dans l'ordre Redis, gateway, worker
  it("names every part that does not answer, in the order Redis, gateway, worker", async () => {
    const probe = probeOf({ worker: async () => false, redis: async () => false });

    expect(await createHealthCheck(probe)()).toEqual({ status: 503, failed: ["redis", "worker"] });
  });

  // Si Redis ne répond jamais (commandes en file pendant la déconnexion), la réponse part au délai, sans attendre
  it("answers at the deadline when Redis never answers, and not before", async () => {
    const check = createHealthCheck(probeOf({ redis: neverAnswers }));
    let answer: Awaited<ReturnType<typeof check>> | undefined;
    void check().then((settled) => {
      answer = settled;
    });

    await vi.advanceTimersByTimeAsync(HEALTH_PART_TIMEOUT_MS - 1);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(answer).toEqual({ status: 503, failed: ["redis"] });
  });

  // Si aucune partie ne répond, la réponse entière part en moins de 5 s : les sondes attendent ensemble, pas l'une après l'autre
  it("answers in under 5 seconds when no part answers, since the probes wait together", async () => {
    const check = createHealthCheck({ redis: neverAnswers, gateway: neverAnswers, worker: neverAnswers });
    let answer: Awaited<ReturnType<typeof check>> | undefined;
    void check().then((settled) => {
      answer = settled;
    });

    await vi.advanceTimersByTimeAsync(4_999);

    expect(answer).toEqual({ status: 503, failed: ["redis", "gateway", "worker"] });
  });

  // Tant qu'une vérification est en cours, une autre requête partage son résultat : Redis coupé, les commandes ne s'empilent pas
  it("shares one running check between concurrent requests", async () => {
    const redis = vi.fn(async () => true);
    const check = createHealthCheck(probeOf({ redis }));

    const [first, second] = await Promise.all([check(), check()]);

    expect(redis).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ status: 200 });
    expect(second).toBe(first);
  });

  // Une vérification terminée ne se garde pas : la suivante interroge de nouveau, et voit le retour des parties
  it("asks again once a check is over", async () => {
    let isUp = false;
    const check = createHealthCheck(probeOf({ gateway: async () => isUp }));

    expect(await check()).toEqual({ status: 503, failed: ["gateway"] });
    isUp = true;
    expect(await check()).toEqual({ status: 200 });
  });
});

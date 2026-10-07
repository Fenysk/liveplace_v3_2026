import type { ConvexDeployment } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConvexUsageSource } from "./convex-usage";

const deployment: ConvexDeployment = {
  name: "watchful-spider-409",
  url: "https://watchful-spider-409.eu-west-1.convex.cloud",
  key: "prod:watchful-spider-409|secret-do-not-print",
};

// La réponse de l'API de déploiement de Convex (en bêta), telle qu'on l'a vue : du texte, avec des clés en snake_case que
// seul l'adaptateur lit. `month` : le nombre du mois, tel qu'il s'écrit dans le JSON.
const metric = (unit: string, month: string) =>
  `{"unit":"${unit}","usage":{"current_day":1,"current_month":${month}}}`;

const USAGES: Record<string, string> = {
  functionCalls: metric("calls", "1234"),
  queryMutationComputeGbHours: metric("GB-hours", "9"),
  actionComputeConvexGbHours: metric("GB-hours", "1.5"),
  actionComputeNodeJsGbHours: metric("GB-hours", "2"),
  actionComputeCpuGbHours: metric("GB-hours", "0.5"),
  databaseIoGb: metric("GB", "0.2"),
  searchQueryGb: metric("GB", "7"),
  dataEgressGb: metric("GB", "0.3"),
};

const bodyOf = (metrics: Record<string, string>) =>
  `{"metrics":{${Object.entries(metrics)
    .map(([name, body]) => `"${name}":${body}`)
    .join(",")}},"seedStatus":"complete"}`;

const reply = (overrides: Record<string, string> = {}) => bodyOf({ ...USAGES, ...overrides });

const stubConvex = (response: () => Response | Promise<Response>) => {
  const asked: {
    url: string;
    authorization: string | null;
    method: string | undefined;
    hasSignal: boolean;
  }[] = [];
  vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) => {
    asked.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
      method: init?.method,
      hasSignal: init?.signal !== undefined,
    });
    return response();
  });
  return asked;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Écart §2 et §9 (JOURNAL 2026-10-07) : l'usage du mois d'un déploiement, lu par `GET /api/v1/get_current_usage`.
describe("createConvexUsageSource (JOURNAL 2026-10-07)", () => {
  // Appelle l'API du déploiement avec sa clé, dans l'en-tête, et dans un délai borné
  it("calls the API of the deployment with its key in the header, within a bounded time", async () => {
    const asked = stubConvex(() => new Response(reply()));

    await createConvexUsageSource(deployment).getUsage();

    expect(asked).toEqual([
      {
        url: "https://watchful-spider-409.eu-west-1.convex.cloud/api/v1/get_current_usage",
        authorization: `Convex ${deployment.key}`,
        method: undefined, // un GET
        hasSignal: true,
      },
    ]);
  });

  // Rend l'usage du mois, et somme les trois calculs d'actions ; les autres métriques ne comptent pas
  it("gives the usage of the month, summing the three action computes, leaving the other metrics out", async () => {
    stubConvex(() => new Response(reply()));

    const result = await createConvexUsageSource(deployment).getUsage();

    expect(result).toEqual({
      ok: true,
      value: { calls: 1234, databaseIoGb: 0.2, egressGb: 0.3, computeGbHours: 4 },
    });
  });

  // Nomme le déploiement, par son nom
  it("names the deployment by its name", () => {
    expect(createConvexUsageSource(deployment).name).toBe("watchful-spider-409");
  });

  // Une forme inconnue n'est jamais un plantage : une métrique absente, un nombre qui n'en est pas un, un autre corps
  it("never crashes on an unknown shape: a missing metric, a value that is no number, another body", async () => {
    const { actionComputeCpuGbHours, ...missing } = USAGES;
    const bodies = [
      bodyOf(missing),
      reply({ functionCalls: metric("calls", "null") }),
      reply({ databaseIoGb: metric("GB", '"0.2"') }),
      reply({ dataEgressGb: metric("GB", "-1") }),
      reply({ dataEgressGb: '{"unit":"GB"}' }),
      '{"metrics":[]}',
      "[]",
      '"ok"',
      "null",
    ];

    for (const body of bodies) {
      stubConvex(() => new Response(body));

      const result = await createConvexUsageSource(deployment).getUsage();

      expect(result, body).toEqual({ ok: false, error: "forme de réponse inconnue" });
    }
  });

  // Dit le code HTTP d'un refus, sans jamais écrire la clé ni l'adresse
  it("says the HTTP code of a refusal, never writing the key or the address", async () => {
    stubConvex(() => new Response("Unauthorized: secret-do-not-print", { status: 401 }));

    const result = await createConvexUsageSource(deployment).getUsage();

    expect(result).toEqual({ ok: false, error: "HTTP 401" });
  });

  // Dit un réseau coupé, un délai dépassé ou un corps illisible, sans la clé, l'adresse ni le message de l'erreur
  it("says a network down, a timeout or an unreadable body, without the key, the address or the message of the error", async () => {
    const failures: (() => Response | Promise<Response>)[] = [
      () => {
        throw new TypeError(`fetch failed: ${deployment.url} ${deployment.key}`);
      },
      () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
      () => new Response("<html>pas du JSON</html>", { status: 200 }),
    ];

    for (const failure of failures) {
      stubConvex(failure);

      const result = await createConvexUsageSource(deployment).getUsage();

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secret-do-not-print");
      expect(JSON.stringify(result)).not.toContain("convex.cloud");
    }
  });
});

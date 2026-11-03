import { describe, expect, it } from "vitest";
import { healthResponse } from "./health-response";

describe("healthResponse (JOURNAL 2026-11-03)", () => {
  // Quand tout répond, le corps est « ok », en 200
  it("says ok with a 200 when everything answers", async () => {
    const response = healthResponse({ status: 200 });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  // Sinon le corps est les seuls noms des parties en échec, séparés par une virgule, en 503
  it("says only the names of the failing parts, with a 503", async () => {
    const response = healthResponse({ status: 503, failed: ["gateway", "worker"] });

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("gateway,worker");
  });

  // Un robot qui cherche le mot « ok » ne le trouve dans aucun nom de partie
  it("never puts the word ok in a failing body", async () => {
    const response = healthResponse({ status: 503, failed: ["redis", "gateway", "worker"] });

    expect(await response.text()).not.toContain("ok");
  });

  // La réponse est du texte brut, jamais gardée ni indexée, qu'elle soit bonne ou mauvaise
  it.each([{ status: 200 as const }, { status: 503 as const, failed: ["redis" as const] }])(
    "is plain text, never cached and never indexed (status $status)",
    (answer) => {
      const { headers } = healthResponse(answer);

      expect(headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(headers.get("cache-control")).toBe("no-store");
      expect(headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );
});

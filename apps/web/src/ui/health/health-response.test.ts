import { afterEach, describe, expect, it, vi } from "vitest";
import { healthResponse } from "./health-response";

describe("healthResponse (JOURNAL 2026-11-03, amendé le 2026-11-21)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Quand tout répond, le corps est « ok », en 200
  it("says ok with a 200 when everything answers", async () => {
    const response = healthResponse({ status: 200 });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  // Sinon le corps est un texte fixe, en 503 : aucun nom de partie ne sort sur Internet
  it("says a fixed text with a 503, without the name of any failing part", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = healthResponse({ status: 503, failed: ["redis", "gateway", "worker"] });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe("unavailable");
    for (const name of ["redis", "gateway", "worker"]) expect(body).not.toContain(name);
  });

  // Les noms des parties en échec vont dans les journaux du web
  it("logs the names of the failing parts on the server", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    healthResponse({ status: 503, failed: ["gateway", "worker"] });

    expect(logged).toHaveBeenCalledWith("healthz : parties en échec :", "gateway,worker");
  });

  // Quand tout répond, rien n'est journalisé
  it("logs nothing when everything answers", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    healthResponse({ status: 200 });

    expect(logged).not.toHaveBeenCalled();
  });

  // Un robot qui cherche le mot « ok » ne le trouve pas dans le corps d'un échec
  it("never puts the word ok in a failing body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = healthResponse({ status: 503, failed: ["redis", "gateway", "worker"] });

    expect(await response.text()).not.toContain("ok");
  });

  // La réponse est du texte brut, jamais gardée ni indexée, qu'elle soit bonne ou mauvaise
  it.each([{ status: 200 as const }, { status: 503 as const, failed: ["redis" as const] }])(
    "is plain text, never cached and never indexed (status $status)",
    (answer) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { headers } = healthResponse(answer);

      expect(headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(headers.get("cache-control")).toBe("no-store");
      expect(headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );
});

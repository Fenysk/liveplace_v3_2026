import { describe, expect, it } from "vitest";
import { betaHeaders } from "./beta";

describe("betaHeaders (JOURNAL 2026-10-04)", () => {
  // Un emplacement de bêta demande aux moteurs de recherche de ne rien indexer ni suivre
  it("asks search engines to neither index nor follow a beta slot", () => {
    expect(betaHeaders("feat/adsense")).toEqual({ "X-Robots-Tag": "noindex, nofollow" });
  });

  // La production n'ajoute aucun en-tête
  it("adds no header in production", () => {
    expect(betaHeaders(null)).toEqual({});
  });
});

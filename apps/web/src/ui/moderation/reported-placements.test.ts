import { PALETTE } from "@liveplace/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PendingReport } from "./pending-reports";
import { ReportedPlacements } from "./reported-placements";

const noop = () => undefined;

const report = (overrides: Partial<PendingReport> = {}): PendingReport => ({
  userId: "3",
  login: "troll42",
  displayName: "Troll42",
  hasAccount: true,
  placementId: "pdemo0001",
  placementIds: ["pdemo0001"],
  reportCount: 2,
  reportedAt: 1_700_000_000_000,
  isOffStream: false,
  pixels: [{ x: 1, y: 2, colorIndex: 3 }],
  ...overrides,
});

const render = (...reports: PendingReport[]) =>
  renderToStaticMarkup(
    createElement(ReportedPlacements, {
      list: { status: "ready", reports },
      approvingReportKey: null,
      canvas: { width: 4, height: 4, palette: PALETTE },
      nowMs: 1_700_000_060_000,
      onClear: noop,
      onBan: noop,
      onApprove: noop,
    }),
  );

describe("Bannir in the reported placements (Écart §5.4, JOURNAL 2026-10-08)", () => {
  // Un signalement offre Effacer, Bannir et Rétablir pour un joueur, et pour un modérateur venu de Twitch seul
  it("offers Effacer, Bannir and Rétablir on a player, and on a moderator who comes from Twitch only", () => {
    const player = render(report());
    const fromTwitch = render(report({ moderatorOrigin: { isFromTwitch: true, isNamedHere: false } }));

    for (const html of [player, fromTwitch]) {
      expect(html).toContain("Effacer le dessin");
      expect(html).toContain("Bannir");
      expect(html).toContain("Rétablir");
    }
  });

  // Un modérateur nommé ici, même modérateur Twitch aussi, garde Effacer et Rétablir mais pas Bannir
  it("drops Bannir for a moderator named here, even when Twitch names him too, and keeps Effacer and Rétablir", () => {
    const namedHere = render(report({ moderatorOrigin: { isFromTwitch: false, isNamedHere: true } }));
    const both = render(report({ moderatorOrigin: { isFromTwitch: true, isNamedHere: true } }));

    for (const html of [namedHere, both]) {
      expect(html).toContain("Effacer le dessin");
      expect(html).toContain("Rétablir");
      expect(html).not.toContain("Bannir");
    }
  });

  // Seule la ligne du modérateur nommé ici perd Bannir : celle d'un joueur à côté le garde
  it("takes Bannir off the moderator's row only, the player's row beside it keeps it", () => {
    const html = render(
      report({ moderatorOrigin: { isFromTwitch: false, isNamedHere: true } }),
      report({ userId: "4", reportedAt: 1_700_000_001_000 }),
    );

    expect(html.match(/Bannir/g)).toHaveLength(1);
  });
});

describe("the reported placements while they load", () => {
  // Trois lignes grises tiennent la place des signalements, sous leur titre
  it("shows three grey rows under its title while the reports load", () => {
    const html = renderToStaticMarkup(
      createElement(ReportedPlacements, {
        list: { status: "loading" },
        approvingReportKey: null,
        canvas: { width: 4, height: 4, palette: PALETTE },
        nowMs: 1_700_000_060_000,
        onClear: noop,
        onBan: noop,
        onApprove: noop,
      }),
    );

    expect(html).toContain("Signalements");
    expect(html).toContain('aria-busy="true"');
    expect(html.split("lp-skeleton-block--button").length - 1).toBe(3);
    expect(html).not.toContain("lp-report ");
  });
});

import { PALETTE } from "@liveplace/domain";
import type { BannedUser, Moderator } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BannedUsers } from "./banned-users";
import { MODERATION_TEXTS } from "./moderation-texts";
import { ModeratorUsers } from "./moderator-users";
import { type PendingReport, pendingReportKey } from "./pending-reports";
import { ReportedPlacements } from "./reported-placements";

// Une action qui échoue sur une ligne ne vide pas la liste (Écart §8.1, JOURNAL 2026-10-13) : la ligne le dit, avec Réessayer.

const noop = () => undefined;
const canvas = { width: 4, height: 4, palette: PALETTE };
const LOST = MODERATION_TEXTS.fr.connectionLost;
const RETRY = ">Réessayer</span>";

const count = (html: string, text: string): number => html.split(text).length - 1;

const report = (userId: string, name: string): PendingReport => ({
  userId,
  login: name.toLowerCase(),
  displayName: name,
  hasAccount: true,
  placementId: `p${userId}`,
  placementIds: [`p${userId}`],
  reportCount: 2,
  reportedAt: 1_700_000_000_000,
  isOffStream: false,
  pixels: [{ x: 1, y: 2, colorIndex: 3 }],
});

const REPORTS = [report("3", "Troll42"), report("4", "Spammer")];

const reports = (failedReportKey: string | null) =>
  renderToStaticMarkup(
    createElement(ReportedPlacements, {
      list: { status: "ready", reports: REPORTS },
      approvingReportKey: null,
      failedReportKey,
      canvas,
      nowMs: 1_700_000_060_000,
      onClear: noop,
      onBan: noop,
      onApprove: noop,
    }),
  );

const BANNED: readonly BannedUser[] = ["3", "4"].map((userId) => ({
  userId,
  login: `ban${userId}`,
  displayName: `Ban${userId}`,
  pixelCount: 5,
  isFromTwitch: false,
  hasAccount: true,
}));

const banned = (failedUserId: string | null) =>
  renderToStaticMarkup(
    createElement(BannedUsers, {
      list: { status: "ready", users: BANNED },
      preview: null,
      unbanningUserId: null,
      failedUserId,
      canvas,
      onPreview: noop,
      onUnban: noop,
    }),
  );

const MODERATORS: readonly Moderator[] = ["7", "8"].map((userId) => ({
  userId,
  login: `mod${userId}`,
  displayName: `Mod${userId}`,
  isFromTwitch: false,
  isNamedHere: true,
  hasAccount: true,
}));

const moderators = (failedUserId: string | null) =>
  renderToStaticMarkup(
    createElement(ModeratorUsers, {
      list: { status: "ready", users: MODERATORS },
      failedUserId,
      onRemove: noop,
    }),
  );

// Le contenu de chaque alerte : une par ligne, puis celle de la liste
const alertsOf = (markup: string): string[] =>
  [...markup.matchAll(/<span[^>]* role="alert"[^>]*>(.*?)<\/span>/g)].map(([, text]) => text ?? "");

describe("a failed action on a row of the Modération tab (Écart §8.1, JOURNAL 2026-10-13)", () => {
  // Rétablir échoue : les deux signalements restent, et seule la ligne concernée dit l'échec, avec Réessayer
  it("keeps both reports when Rétablir fails, and says it on its own row with Réessayer", () => {
    const html = reports(pendingReportKey(REPORTS[0] as PendingReport));

    expect(count(html, "lp-report-preview")).toBe(2);
    expect(count(html, "Rétablir")).toBe(2);
    expect(alertsOf(html).filter((text) => text === LOST)).toHaveLength(1);
    expect(count(html, RETRY)).toBe(1);
    expect(html).toContain("lp-row-failure lp-row-failure--failed");
  });

  // Débannir échoue : les deux bannis restent, seule la ligne concernée dit l'échec
  it("keeps both banned viewers when Débannir fails, and says it on its own row with Réessayer", () => {
    const html = banned("4");

    expect(count(html, "Débannir")).toBe(2);
    expect(count(html, "lp-window-row--failed")).toBe(1);
    expect(alertsOf(html).filter((text) => text === LOST)).toHaveLength(1);
    expect(count(html, RETRY)).toBe(1);
  });

  // Retirer le rôle échoue : les deux modérateurs restent, seule la ligne concernée dit l'échec
  it("keeps both moderators when Retirer le rôle fails, and says it on its own row with Réessayer", () => {
    const html = moderators("7");

    expect(count(html, "Retirer le rôle")).toBe(2);
    expect(count(html, "lp-window-row--failed")).toBe(1);
    expect(alertsOf(html).filter((text) => text === LOST)).toHaveLength(1);
    expect(count(html, RETRY)).toBe(1);
  });

  // Sans échec, chaque ligne et la liste gardent leur alerte vide, sans Réessayer ni ligne qui bouge
  it("keeps an empty alert on each row and on the list, and no Réessayer, while nothing failed", () => {
    for (const html of [reports(null), banned(null), moderators(null)]) {
      expect(alertsOf(html)).toEqual(["", "", ""]);
      expect(html).not.toContain("Réessayer");
      expect(html).not.toContain("--failed");
    }
  });
});

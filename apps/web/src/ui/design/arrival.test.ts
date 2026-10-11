import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PALETTE } from "@liveplace/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toScoreboardRows } from "../../state/scoreboard";
import type { ListedArchive } from "../../usecase/list-canvases";
import { ArchivesSection } from "../archive/canvas-cards";
import { BannedUsers } from "../moderation/banned-users";
import { ModeratorUsers } from "../moderation/moderator-users";
import { ReportedPlacements } from "../moderation/reported-placements";
import { ScoreboardList } from "../scoreboard/scoreboard-list";
import { ScoreboardPill } from "../scoreboard/scoreboard-pill";
import { type CanvasActivityAccount, CanvasActivityCard, ConnectedAccounts } from "./canvas-activity-card";

// Les lignes d'une liste de la fenêtre arrivent en fondu avec une montée de 4 px, toutes ensemble : une seule règle, `lp-arrives`.

const css = readFileSync(join(import.meta.dirname, "arrival.css"), "utf8").replace(/\s+/g, " ");
const noop = () => undefined;
const arrivals = (html: string): number => html.match(/\blp-arrives\b/g)?.length ?? 0;

describe("la règle des lignes qui arrivent", () => {
  // Un fondu et une montée de 4 px, pendant `--lp-dur-fade` et sur `--lp-ease` : `prefers-reduced-motion` les met à 0
  it("fades the row in with a 4 px rise, through the motion tokens", () => {
    expect(css).toContain("animation: lp-arrives var(--lp-dur-fade) var(--lp-ease)");
    expect(css).toMatch(/@keyframes lp-arrives \{ from \{ opacity: 0; transform: translateY\(4px\); \} \}/);
    expect(css).not.toMatch(/\d(ms|s)\b/);
  });

  // Toutes ensemble, sans décalage entre elles : un décalage ralentirait la lecture d'une longue liste
  it("starts every row at once, with no delay between them", () => {
    expect(css).not.toMatch(/animation-delay|nth-child|nth-of-type|--index/);
  });

  // Chrome ne confie pas au compositeur une animation dont les images clés portent un `var()` : elle saccade
  it("keeps var() out of its keyframes, which Chrome would not hand to the compositor", () => {
    const keyframes = /@keyframes lp-arrives \{(.*)\}/.exec(css)?.[1] ?? "";
    expect(keyframes).not.toBe("");
    expect(keyframes).not.toContain("var(");
  });

  // L'animation joue à l'insertion de la ligne : un nouveau rendu ne la rejoue pas pour celles qui sont déjà là
  it("is a plain animation on the row, played when the row is inserted, not a class a render toggles", () => {
    expect(css).toMatch(/\.lp-arrives \{ animation:/);
    expect(css).not.toMatch(/\.is-|:not\(|transition/);
  });
});

const archive = (index: number): ListedArchive => ({
  canvasId: `archive-${index}`,
  createdAt: Date.UTC(2026, 9, 12, 10),
  archivedAt: Date.UTC(2026, 9, 18, 10),
  linkCode: `code${index}xxxxxx`,
  thumbnail: null,
});

const archives = (count: number): string =>
  renderToStaticMarkup(
    createElement(ArchivesSection, {
      list: {
        status: "ready",
        canvases: {
          active: { canvasId: "canvas-actif", createdAt: Date.UTC(2026, 9, 4, 10), thumbnail: null },
          archives: Array.from({ length: count }, (_, index) => archive(index + 1)),
        },
      },
      login: "kalyss",
      onArchive: noop,
      onCopyLink: noop,
      onReopen: noop,
      onDiscard: noop,
      onRetry: noop,
    }),
  );

describe("les listes de la fenêtre qui reçoivent leurs lignes", () => {
  // Archives : la fresque en cours, puis chaque archive
  it("brings in the current canvas and each archive of the Archives list", () => {
    expect(arrivals(archives(0))).toBe(1);
    expect(arrivals(archives(3))).toBe(4);
  });

  const person = (userId: string) => ({
    userId,
    login: `joueur${userId}`,
    displayName: `Joueur ${userId}`,
    hasAccount: true,
  });
  const canvas = { width: 4, height: 4, palette: PALETTE };

  // Modération : les signalements, les bannis, les modérateurs
  it("brings in each report, each banned player and each moderator of the Modération lists", () => {
    const reports = renderToStaticMarkup(
      createElement(ReportedPlacements, {
        list: {
          status: "ready",
          reports: ["1", "2"].map((userId) => ({
            ...person(userId),
            placementId: `pdemo000${userId}`,
            placementIds: [`pdemo000${userId}`],
            reportCount: 2,
            reportedAt: 1_700_000_000_000,
            isOffStream: false,
            pixels: [{ x: 1, y: 2, colorIndex: 3 }],
          })),
        },
        approvingReportKey: null,
        canvas,
        nowMs: 1_700_000_060_000,
        onClear: noop,
        onBan: noop,
        onApprove: noop,
      }),
    );
    const banned = renderToStaticMarkup(
      createElement(BannedUsers, {
        list: {
          status: "ready",
          users: ["1", "2", "3"].map((userId) => ({
            ...person(userId),
            pixelCount: 4,
            isFromTwitch: false,
          })),
        },
        preview: null,
        unbanningUserId: null,
        canvas,
        onPreview: noop,
        onUnban: noop,
      }),
    );
    const moderators = renderToStaticMarkup(
      createElement(ModeratorUsers, {
        list: {
          status: "ready",
          users: ["1", "2"].map((userId) => ({ ...person(userId), isFromTwitch: true, isNamedHere: false })),
        },
      }),
    );

    expect(arrivals(reports)).toBe(2);
    expect(arrivals(banned)).toBe(3);
    expect(arrivals(moderators)).toBe(2);
  });

  // Activité : chaque fresque, et chaque compte de « Qui est là »
  it("brings in each canvas and each connected account of the Activity lists", () => {
    const owner = { userId: "1", login: "kalyss", displayName: "Kalyss" };
    const connected: CanvasActivityAccount[] = ["1", "2"].map((userId) => ({
      user: person(userId),
      mention: "Viewer · depuis 3 min",
      devices: ["desktop"],
    }));
    const card = renderToStaticMarkup(
      createElement(CanvasActivityCard, {
        owner,
        facts: ["3 personnes", "120 px/h"],
        accounts: [],
        guestsLine: null,
        isOpen: false,
        onToggle: noop,
      }),
    );
    const accounts = renderToStaticMarkup(
      createElement(ConnectedAccounts, {
        accounts: connected,
        guestsLine: "+ 2 invités",
        emptyText: "Personne",
      }),
    );

    expect(arrivals(card)).toBe(1);
    expect(arrivals(accounts)).toBe(2);
  });

  // Le classement a déjà `lp-rank-in` et le glissement : il n'ajoute pas la sienne
  it("leaves the scoreboard to its own animations", () => {
    const rows = toScoreboardRows(
      { top: [{ login: "ada", displayName: "Ada", pixels: 12 }] },
      { login: "ada", displayName: "Ada" },
    );
    const pill = renderToStaticMarkup(
      createElement(ScoreboardPill, { rows, isCollapsed: false, onToggle: noop }),
    );
    const list = renderToStaticMarkup(createElement(ScoreboardList, { rows }));

    expect(arrivals(pill)).toBe(0);
    expect(arrivals(list)).toBe(0);
  });
});

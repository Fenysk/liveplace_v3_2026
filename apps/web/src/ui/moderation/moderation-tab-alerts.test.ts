import { PALETTE } from "@liveplace/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type BannedList, BannedUsers } from "./banned-users";
import { MODERATION_TEXTS } from "./moderation-texts";
import { type ModeratorListView, ModeratorUsers } from "./moderator-users";
import { ReportedPlacements, type ReportList } from "./reported-placements";

const CONNECTION_LOST = MODERATION_TEXTS.fr.connectionLost;

const noop = () => undefined;
const canvas = { width: 4, height: 4, palette: PALETTE };

const reports = (list: ReportList) =>
  renderToStaticMarkup(
    createElement(ReportedPlacements, {
      list,
      approvingReportKey: null,
      canvas,
      nowMs: 1_700_000_060_000,
      onClear: noop,
      onBan: noop,
      onApprove: noop,
    }),
  );

const moderators = (list: ModeratorListView) => renderToStaticMarkup(createElement(ModeratorUsers, { list }));

const banned = (list: BannedList) =>
  renderToStaticMarkup(
    createElement(BannedUsers, {
      list,
      preview: null,
      unbanningUserId: null,
      canvas,
      onPreview: noop,
      onUnban: noop,
    }),
  );

const LISTS = [
  {
    name: "reports",
    render: (isFailed: boolean) =>
      reports(isFailed ? { status: "failed" } : { status: "ready", reports: [] }),
  },
  {
    name: "moderators",
    render: (isFailed: boolean) =>
      moderators(isFailed ? { status: "failed" } : { status: "ready", users: [] }),
  },
  {
    name: "banned users",
    render: (isFailed: boolean) => banned(isFailed ? { status: "failed" } : { status: "ready", users: [] }),
  },
];

// Le contenu de l'alerte de la liste, `undefined` si elle n'en a pas.
const alertOf = (markup: string): string | undefined =>
  markup.match(/<span[^>]* role="alert"[^>]*>(.*?)<\/span>/)?.[1];

describe("what a screen reader hears of the Modération tab", () => {
  for (const { name, render } of LISTS) {
    // L'alerte de la liste est là avant l'échec, vide : le texte qui s'y ajoute est lu
    it(`has the ${name} alert before anything fails, empty`, () => {
      expect(alertOf(render(false))).toBe("");
    });

    // Une connexion coupée se dit tout de suite, par la phrase des fenêtres
    it(`says a lost connection of the ${name} at once`, () => {
      expect(alertOf(render(true))).toBe(CONNECTION_LOST);
    });
  }
});

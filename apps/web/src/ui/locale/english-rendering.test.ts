// L'interface en anglais (Écart §14, JOURNAL 2026-10-07) : chaque surface rendue sous un `LocaleProvider` anglais dit ses
// mots en anglais, et ne garde aucun mot français.

import { PALETTE } from "@liveplace/domain";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toScoreboardRows } from "../../state/scoreboard";
import { AccountPill } from "../account/account-pill";
import { AccountWindow } from "../account/account-window";
import { ArchiveBanner } from "../archive/archive-banner";
import { ArchiveNotFound } from "../archive/archive-not-found";
import { ArchivesSection } from "../archive/canvas-cards";
import { DownloadWindow } from "../archive/download-window";
import { CanvasSettings, ResizeWindow } from "../canvas/canvas-settings";
import { ViewportPill } from "../canvas/viewport-pill";
import { ClaimButton } from "../design/gauge";
import { Palette } from "../design/palette";
import { SignInNote } from "../design/twitch";
import { DraftPill, type DraftPillActions, type DraftPillState } from "../draft/draft-pill";
import { InspectionPill } from "../inspection/inspection-pill";
import { BannedWindow } from "../moderation/banned-window";
import { PLACEMENT_ONLY } from "../moderation/cleared-pixels";
import { ModerationWindow } from "../moderation/moderation-window";
import { ObsSettings } from "../obs/obs-settings";
import { ScoreboardList } from "../scoreboard/scoreboard-list";
import { ScoreboardPill } from "../scoreboard/scoreboard-pill";
import { LocaleProvider } from "./use-locale";

const doNothing = (): void => undefined;

const inEnglish = (element: ReactElement): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: "en" }, element));

const GAUGE = { charges: 8, max: 10, refill: null, label: "8 / 10 charges, gauge full" };
const ACTIONS: DraftPillActions = {
  onEnter: doNothing,
  onClaim: doNothing,
  onExit: doNothing,
  onSubmit: doNothing,
  onDiscard: doNothing,
  onPickColor: doNothing,
  onToggleEraser: doNothing,
  onTogglePicker: doNothing,
  onToggleTouchTracing: doNothing,
  onReload: doNothing,
  onSignIn: doNothing,
};
const draftPill = (state: DraftPillState): string =>
  inEnglish(createElement(DraftPill, { state, actions: ACTIONS, isDocked: false }));

const kalyss = { kind: "signedIn", user: { displayName: "Kalyss", login: "kalyss" } } as const;
const accountPill = (props: Partial<Parameters<typeof AccountPill>[0]> = {}): string =>
  inEnglish(
    createElement(AccountPill, {
      identity: kalyss,
      signInHref: "#",
      themeChoice: "auto",
      onPickTheme: doNothing,
      onOpenAccount: doNothing,
      ...props,
    }),
  );

describe("the account in English (Écart §14, JOURNAL 2026-10-07)", () => {
  // La pill Compte : ses titres, le point des signalements dit en anglais, et le bouton de langue pour revenir
  it("says the account pill in English, with the pending reports", () => {
    const markup = accountPill({ onOpenSettings: doNothing, pendingReports: 2 });

    expect(markup).toContain('title="Settings"');
    expect(markup).toContain('title="My account · 2 reports pending"');
    expect(markup).toContain('title="Theme: Auto"');
    expect(markup).toContain('title="Switch to French"');
    expect(markup).toContain(">EN</span>");
    expect(accountPill({ identity: { kind: "guest" } })).toContain(">Sign in</span>");
    expect(accountPill({ identity: { kind: "guest" } })).toContain('title="Sign in with Twitch"');
  });

  // La fenêtre : ses sections, Se déconnecter, le thème et la langue
  it("says the sections of the window and the account section in English", () => {
    const tab = (text: string) => createElement("p", null, text);
    const markup = inEnglish(
      createElement(AccountWindow, {
        isOpen: true,
        sectionId: "account",
        onSelect: doNothing,
        onClose: doNothing,
        user: { displayName: "Kalyss", login: "kalyss" },
        signOutHref: "#",
        themeChoice: "dark",
        onPickTheme: doNothing,
        canvasTab: tab("a"),
        canvasesTab: tab("b"),
        obsTab: tab("c"),
        moderationTab: tab("d"),
        scoreboardTab: tab("e"),
      }),
    );
    const sections = [
      ...(/<nav[^>]*>(.*?)<\/nav>/s.exec(markup)?.[1] ?? "").matchAll(/<\/svg>([^<]+)<\/button>/g),
    ];

    expect(sections.map(([, label]) => label)).toEqual([
      "Canvas",
      "Archives",
      "OBS view",
      "Moderation",
      "Scoreboard",
      "My account",
    ]);
    expect(markup).toContain("Sign out");
    expect(markup).toMatch(/aria-label="Theme"/);
    expect(markup).toContain("Light");
    expect(markup).toContain("Dark");
    expect(markup).toMatch(/aria-label="Language"/);
    expect(markup).toContain('title="Close (Esc)"');
  });

  // L'invitation à se connecter sous un bouton, et la poignée de la fenêtre
  it("says the sign-in note and the claim button in English", () => {
    expect(inEnglish(createElement(SignInNote))).toContain("By signing in, you accept the ");
    expect(inEnglish(createElement(SignInNote))).toContain("privacy policy</a>");
    expect(inEnglish(createElement(ClaimButton, { onClaim: doNothing }))).toContain(
      'aria-label="Raise the gauge by +1 pixel"',
    );
  });
});

describe("the Draw pill in English (Écart §14, JOURNAL 2026-10-07)", () => {
  // Les états de connexion : l'invitation, le ban, la coupure
  it("says the connection, the ban and the invitation in English", () => {
    expect(draftPill({ kind: "connecting" })).toContain("Connecting");
    expect(draftPill({ kind: "closed" })).toContain("Connection lost");
    expect(draftPill({ kind: "closed" })).toContain(">Reload</span>");
    expect(draftPill({ kind: "banned" })).toContain("You&#x27;re banned from this canvas");
    expect(draftPill({ kind: "guest", signInHref: "#" })).toContain("Sign in to draw");
    expect(draftPill({ kind: "signingIn", signInHref: "#" })).toContain("Connecting to Twitch");
  });

  // La vue : Dessiner, et un refus du gateway dit en phrase, jamais son code
  it("says Draw, and a refusal of the gateway as a sentence rather than its code", () => {
    const markup = draftPill({ kind: "view", gauge: GAUGE, canClaim: false, refusal: "rate_limited" });

    expect(markup).toContain(">Draw</span>");
    expect(markup).toContain('title="Switch to Draw mode"');
    expect(markup).toContain("Too fast: try again in a moment.");
    expect(markup).not.toContain("rate_limited");
  });

  // Le mode Dessin : ses boutons et leurs infobulles
  it("says the buttons of the Draw mode and their tips in English", () => {
    const markup = draftPill({
      kind: "draft",
      gauge: GAUGE,
      palette: PALETTE,
      colorIndex: 5,
      recentColorIndexes: [],
      isSending: false,
      canSubmit: true,
      canDiscard: true,
      isTouchScreen: true,
      isTouchTracing: false,
      isPicking: false,
    });

    expect(markup).toContain(">Cancel</span>");
    expect(markup).toContain(">Confirm</span>");
    expect(markup).toContain('title="Place the draft"');
    expect(markup).toContain('title="Clear the draft"');
    expect(markup).toContain('title="Leave Draw mode (your draft is kept)"');
    expect(markup).toContain('title="Trace: one finger draws, two fingers move"');
    expect(markup).toContain('title="Eyedropper (I): picks the color of a placed pixel"');
    expect(markup).toContain('title="Eraser (E)"');
    expect(markup).toContain("Color #");
  });

  // La palette seule
  it("says the eraser and the colors of the palette in English", () => {
    const markup = inEnglish(createElement(Palette, { palette: PALETTE, colorIndex: 1, onPick: doNothing }));

    expect(markup).toContain('aria-label="Eraser"');
    expect(markup).toMatch(/aria-label="Color #[0-9a-f]+"/i);
  });
});

describe("the windows of the game in English (Écart §14, JOURNAL 2026-10-07)", () => {
  const canvas = { width: 8, height: 8, palette: PALETTE };

  // La confirmation d'une modération : titre, conséquence, boutons
  it("says the moderation confirmation in English", () => {
    const markup = inEnglish(
      createElement(ModerationWindow, {
        request: { kind: "ban", author: { userId: "u1", displayName: "Troll", placementId: "p1" } },
        pixels: [],
        scope: PLACEMENT_ONLY,
        status: "failed",
        canvas,
        onScope: doNothing,
        onConfirm: doNothing,
        onClose: doNothing,
      }),
    );

    expect(markup).toContain("Ban Troll?");
    expect(markup).toContain(
      "No visible pixels. This account will no longer be able to place on this canvas",
    );
    expect(markup).toContain(">Ban</span>");
    expect(markup).toContain(">Cancel</span>");
    expect(markup).toContain("The connection dropped. Try again in a moment");
  });

  // Signaler : le titre dépend d'une pose seule ou de plusieurs, et la plage porte son libellé anglais
  it("says the report confirmation and its time range in English", () => {
    const markup = inEnglish(
      createElement(ModerationWindow, {
        request: { kind: "report", author: { displayName: "Troll", placementId: "p1", x: 1, y: 2 } },
        pixels: [],
        scope: PLACEMENT_ONLY,
        status: "idle",
        canvas,
        onScope: doNothing,
        onConfirm: doNothing,
        onClose: doNothing,
      }),
    );

    expect(markup).toContain("Report this placement by Troll?");
    expect(markup).toContain("Time range");
    expect(markup).toContain("This placement only");
    expect(markup).toContain(">Report</span>");
  });

  // La fenêtre du banni
  it("says the banned window in English", () => {
    const markup = inEnglish(
      createElement(BannedWindow, { isOpen: true, pixels: null, canvas, onClose: doNothing }),
    );

    expect(markup).toContain("You&#x27;re banned from this canvas");
    expect(markup).toContain("You can only watch the canvas.");
    expect(markup).toContain(">Got it</span>");
  });

  // La pill Inspection : une case vide, puis une pose avec Signaler et la modération
  it("says the inspection of an empty cell and of a placed pixel in English", () => {
    const empty = inEnglish(
      createElement(InspectionPill, {
        inspection: { status: "empty", x: 3, y: 4 },
        palette: PALETTE,
        nowMs: 0,
        onClose: doNothing,
        isDocked: false,
      }),
    );
    const found = inEnglish(
      createElement(InspectionPill, {
        inspection: {
          status: "found",
          x: 3,
          y: 4,
          entry: {
            displayName: "Troll",
            login: "troll",
            userId: "u1",
            colorIndex: 0,
            placedAt: 1_700_000_000_000,
            placementId: "p1",
            canReport: true,
          },
        },
        palette: PALETTE,
        nowMs: 1_700_000_000_000 + 3 * 3_600_000,
        onClose: doNothing,
        report: { status: "available", onReport: doNothing },
        moderation: { isProtected: () => false, onModerate: doNothing, onSetModerator: doNothing },
        isDocked: false,
      }),
    );

    expect(empty).toContain("Nobody has placed here yet");
    expect(empty).toContain('title="Close (Esc)"');
    expect(found).toContain("3 hours ago");
    expect(found).toContain(">Report</span>");
    expect(found).toContain(">Clear their pixels</span>");
    expect(found).toContain(">Ban</span>");
    expect(found).toContain(">Make moderator</span>");
    expect(found).toContain('title="Transparent (eraser)"');
    expect(found).toMatch(/title="Placed on [^"]+"/);
  });

  // Le scoreboard : rang à l'anglaise, nombres à l'anglaise
  it("says the scoreboard with English ranks and numbers", () => {
    const rows = toScoreboardRows(
      {
        top: [
          { login: "ada", displayName: "Ada", pixels: 1204 },
          { login: "bob", displayName: "Bob", pixels: 1 },
        ],
        you: { rank: 12, pixels: 2 },
      },
      { login: "moi", displayName: "Moi" },
    );
    const pill = inEnglish(createElement(ScoreboardPill, { rows, isCollapsed: false, onToggle: doNothing }));
    const list = inEnglish(createElement(ScoreboardList, { rows }));

    expect(pill).toContain('aria-label="1st, Ada, 1,204 pixels"');
    expect(pill).toContain('aria-label="2nd, Bob, 1 pixel"');
    expect(pill).toContain('aria-label="12th, Moi, 2 pixels"');
    expect(pill).toContain('aria-label="Collapse the scoreboard"');
    expect(pill).toContain('aria-label="Scoreboard"');
    expect(list).toContain("12<sup");
    expect(list).toContain(">th</sup> · 2 pixels");
  });
});

describe("the canvas settings and the archives in English (Écart §14, JOURNAL 2026-10-07)", () => {
  const current = { width: 32, height: 32 };

  // Le nom, la taille, le format et la confirmation
  it("says the Canvas section and the resize confirmation in English", () => {
    const section = inEnglish(
      createElement(CanvasSettings, {
        name: { status: "ready", value: "", isSaving: false, onInput: doNothing, onCommit: doNothing },
        current,
        choice: { format: "16:9", sizeIndex: 1 },
        chosen: { width: 64, height: 36 },
        onChoose: doNothing,
        onApply: doNothing,
      }),
    );
    const resize = inEnglish(
      createElement(ResizeWindow, {
        next: { width: 64, height: 36 },
        outside: [{ x: 40, y: 3, colorIndex: 4 }],
        status: "idle",
        canvas: { width: 64, height: 36, palette: PALETTE },
        onConfirm: doNothing,
        onClose: doNothing,
      }),
    );

    expect(section).toContain("Canvas name");
    expect(section).toContain("Currently 32 × 32 cells.");
    expect(section).toContain("Landscape 16:9, 64 × 36 cells. Nothing is lost");
    for (const label of ["Small", "Medium", "Large", "Change size"]) expect(section).toContain(label);
    expect(resize).toContain("Switch to 64 × 36 cells?");
    expect(resize).toContain("1 pixel falls outside the frame");
    expect(resize).toContain("it comes back when the canvas grows");
  });

  // La pill Pratique
  it("says the tips of the zoom pill in English, the percent without a space", () => {
    const markup = inEnglish(
      createElement(ViewportPill, {
        framing: { zoomPercent: 150, isArrival: false },
        onZoomIn: doNothing,
        onZoomOut: doNothing,
        onRecenter: doNothing,
        isDocked: false,
      }),
    );

    expect(markup).toContain('title="Zoom in"');
    expect(markup).toContain('title="Zoom out"');
    expect(markup).toContain('title="Recenter the view"');
    expect(markup).toContain(">150%</span>");
  });

  // La section Archives : le canvas en cours, ses dates, la ligne d'une archive
  it("says the Archives section in English, dates included", () => {
    const html = renderToStaticMarkup(
      createElement(
        LocaleProvider,
        { initial: "en" },
        createElement(ArchivesSection, {
          list: {
            status: "ready",
            canvases: {
              active: { canvasId: "a", createdAt: Date.UTC(2026, 9, 4, 10), thumbnail: null },
              archives: [
                {
                  canvasId: "b",
                  createdAt: Date.UTC(2026, 9, 12, 10),
                  archivedAt: Date.UTC(2026, 9, 18, 10),
                  linkCode: "codecodecode",
                  thumbnail: null,
                },
              ],
            },
          },
          login: "kalyss",
          onArchive: doNothing,
          onCopyLink: doNothing,
          onReopen: doNothing,
          onDiscard: doNothing,
          onRetry: doNothing,
        }),
      ),
    );

    expect(html).toContain("Current canvas");
    expect(html).toContain("Since Oct 4, 2026");
    expect(html).toContain("Archives · 1 of 5");
    expect(html).toContain("Oct 12–18, 2026");
    expect(html).toContain('title="View the archive"');
    expect(html).toContain("Open the Oct 12–18, 2026 archive in a new tab");
    expect(html).toContain('title="Copy link"');
    expect(html).toContain('title="Delete"');
    expect(html).toContain(">Reopen</span>");
  });

  // La page d'une archive : le bandeau, le téléchargement, l'archive introuvable
  it("says the archive banner, the PNG window and the missing archive in English", () => {
    const banner = inEnglish(
      createElement(ArchiveBanner, {
        owner: { displayName: "Kalyss", login: "kalyss" },
        title: "Kalyss's archive",
        caption: "Oct 12–18, 2026",
        isDownloading: false,
        onCopyLink: doNothing,
        onDownload: doNothing,
        isDocked: false,
      }),
    );
    const download = inEnglish(
      createElement(DownloadWindow, {
        isOpen: true,
        background: null,
        onBackground: doNothing,
        isCompact: false,
        onConfirm: doNothing,
        onClose: doNothing,
      }),
    );
    const missing = inEnglish(createElement(ArchiveNotFound, { login: "kalyss", displayName: "Kalyss" }));

    expect(banner).toContain(">Copy link</span>");
    expect(banner).toContain(">Download as PNG</span>");
    expect(download).toContain("Image background");
    expect(download).toContain('aria-label="Black"');
    expect(download).toContain('aria-label="White"');
    expect(download).toContain(">Download</span>");
    expect(missing).toContain("This archive doesn&#x27;t exist, or it was deleted.");
    expect(missing).toContain("View Kalyss&#x27;s canvas");
  });

  // La vue OBS de la fenêtre
  it("says the OBS section in English", () => {
    const markup = inEnglish(
      createElement(ObsSettings, {
        address: "liveplace.test/kalyss",
        url: "https://liveplace.test/kalyss",
        obsDelayMs: 0,
        onPickDelay: doNothing,
        obsBackground: "black",
        onPickBackground: doNothing,
      }),
    );

    expect(markup).toContain("Address to paste into OBS");
    expect(markup).toContain("In OBS Studio or Streamlabs: Sources, +, Browser.");
    expect(markup).toContain(">Delay</label>");
    expect(markup).toContain(">None</span>");
    expect(markup).toContain("OBS view background");
    expect(markup).toContain('aria-label="Transparent"');
    expect(markup).toContain('aria-label="Black"');
  });
});

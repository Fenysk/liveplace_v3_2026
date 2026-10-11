import { toCellKey } from "@liveplace/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CanvasView } from "../../state/canvas-store";
import type { DraftView } from "../../state/draft-store";
import type { GaugeProps } from "../design/gauge";
import { formatWait, msToNextSecond, submitLabel, submitWords, waitSecondsOf } from "./draft-labels";
import { DraftPill, type DraftPillActions } from "./draft-pill";
import { toDraftPillState } from "./use-draft-pill";

const noop = () => undefined;
const ACTIONS: DraftPillActions = {
  onEnter: noop,
  onClaim: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onPickColor: noop,
  onToggleEraser: noop,
  onTogglePicker: noop,
  onToggleTouchTracing: noop,
  onReload: noop,
  onSignIn: noop,
};
const GAUGE: GaugeProps = { charges: 6, max: 10, refill: null, label: "6 / 10 charges, jauge pleine" };

const canvasView = (claimable: number): CanvasView => ({
  status: "live",
  width: 50,
  height: 50,
  palette: [],
  version: 1,
  isBanned: false,
  isArchived: false,
  isDiscarded: false,
  userId: "user-1",
  gauge: { charges: 6, max: 10, nextRefillAt: 0, claimable },
  reportCount: 0,
  lastError: null,
  inspection: null,
  isImageLoaded: true,
  pixels: new Uint8Array(0),
});

// En Vue, avec `keptCells` cases gardées du dernier Dessin
const viewDraft = (keptCells: number): DraftView => ({
  mode: "view",
  draft: new Map(Array.from({ length: keptCells }, (_, x) => [toCellKey(x, 0), { x, y: 0, colorIndex: 1 }])),
  colorIndex: 1,
  isSending: false,
  isTracing: false,
  isTouchTracing: false,
  isPicking: false,
  shakeCount: 0,
  recentColorIndexes: [],
});

// La pill telle que la page la rend, de la jauge du canvas et du brouillon gardé
const viewMarkup = (keptCells: number, claimable = 0): string =>
  renderToStaticMarkup(
    createElement(DraftPill, {
      state: toDraftPillState(canvasView(claimable), viewDraft(keptCells), GAUGE, "user1", false, undefined),
      actions: ACTIONS,
      isCompact: true,
      isDocked: false,
    }),
  );

describe("the Draft button in View (Écart §9.3, JOURNAL 2026-10-09)", () => {
  // Sans brouillon gardé, le bouton dit Dessiner, même jauge vide
  it("says Dessiner when no draft is kept", () => {
    const markup = viewMarkup(0);

    expect(markup).toContain("<span>Dessiner</span>");
    expect(markup).toContain('title="Passer en mode Dessin"');
  });

  // Un brouillon gardé ne change pas le mot : Dessiner tout court, ni « Reprendre » ni nombre de pixels
  it("says Dessiner and nothing more when a draft is kept", () => {
    for (const keptCells of [1, 5]) {
      const markup = viewMarkup(keptCells);

      expect(markup).toContain("<span>Dessiner</span>");
      expect(markup).not.toContain("Reprendre");
      expect(markup).not.toContain(" px");
    }
  });

  // Une récompense qui attend prend la place de Dessiner, avec ou sans brouillon gardé
  it("gives way to the +1 when a reward waits, whether or not a draft is kept", () => {
    for (const keptCells of [0, 5]) {
      const markup = viewMarkup(keptCells, 1);

      expect(markup).toContain("lp-claim");
      expect(markup).not.toContain("Dessiner");
    }
  });
});

describe("submitLabel (Écart §9.3, JOURNAL 2026-10-08)", () => {
  // Brouillon vide avec des charges : Valider, comme avant
  it("says Valider alone for an empty draft", () => {
    expect(submitLabel(0, undefined, "fr")).toBe("Valider");
  });

  // Un brouillon, sa taille dans le bouton
  it("adds the draft size", () => {
    expect(submitLabel(3, undefined, "fr")).toBe("Valider · 3");
    expect(submitLabel(12, undefined, "fr")).toBe("Valider · 12");
  });

  // Plus aucune charge et rien à poser : le bouton compte jusqu'à la prochaine
  it("counts down to the next charge when there is nothing to place and no charge", () => {
    expect(submitLabel(0, 12, "fr")).toBe("Attendre 12 s");
    expect(submitLabel(0, 65, "fr")).toBe("Attendre 1 min 05");
  });
});

describe("submitWords", () => {
  // Le mot de devant « Attendre » est à part : sur un écran étroit, le bouton garde « 12 s » seul
  it("splits the leading word from the wait so a narrow screen can drop it", () => {
    expect(submitWords(0, 12, "fr")).toEqual({ lead: "Attendre ", label: "12 s" });
    expect(submitWords(0, 65, "fr")).toEqual({ lead: "Attendre ", label: "1 min 05" });
  });

  // Hors attente, aucun mot à retirer
  it("has no leading word outside the wait", () => {
    expect(submitWords(0, undefined, "fr")).toEqual({ lead: "", label: "Valider" });
    expect(submitWords(3, undefined, "fr")).toEqual({ lead: "", label: "Valider · 3" });
  });
});

describe("formatWait", () => {
  // Sous la minute, des secondes seules, sans zéro de tête
  it("writes seconds alone under a minute", () => {
    expect(formatWait(1)).toBe("1 s");
    expect(formatWait(9)).toBe("9 s");
    expect(formatWait(59)).toBe("59 s");
  });

  // Dès la minute, minutes et secondes sur deux chiffres
  it("writes minutes and two-digit seconds from a minute", () => {
    expect(formatWait(60)).toBe("1 min 00");
    expect(formatWait(65)).toBe("1 min 05");
    expect(formatWait(125)).toBe("2 min 05");
    expect(formatWait(600)).toBe("10 min 00");
  });
});

describe("waitSecondsOf", () => {
  // La seconde entière restante : elle bascule pile quand le reste passe un multiple de 1000 ms
  it("rounds the remaining time up to the whole second", () => {
    expect(waitSecondsOf(12_345)).toBe(13);
    expect(waitSecondsOf(12_000)).toBe(12);
    expect(waitSecondsOf(1)).toBe(1);
  });

  // Jamais « Attendre 0 s » : à zéro, la jauge a déjà rendu sa charge
  it("never goes below one second", () => {
    expect(waitSecondsOf(0)).toBe(1);
    expect(waitSecondsOf(-50)).toBe(1);
  });
});

describe("msToNextSecond", () => {
  const NOW = 1_000_000;

  // La minuterie se cale pour que le libellé change pile quand le reste passe un multiple de 1000 ms
  it("waits until the remaining time crosses a whole second", () => {
    expect(msToNextSecond(NOW + 12_345, NOW)).toBe(345);
    expect(msToNextSecond(NOW + 12_001, NOW)).toBe(1);
  });

  // Déjà sur la seconde : la suivante, pas zéro (une minuterie à zéro tournerait à vide)
  it("waits a full second when the countdown is already on a whole second", () => {
    expect(msToNextSecond(NOW + 12_000, NOW)).toBe(1000);
    expect(msToNextSecond(NOW, NOW)).toBe(1000);
  });

  // Échéance passée : on reste sur la même phase, jusqu'à ce que la jauge en donne une nouvelle
  it("stays on the same second phase once the deadline is past", () => {
    expect(msToNextSecond(NOW - 345, NOW)).toBe(655);
  });

  // Sans compte à rebours (jauge pleine), une seconde
  it("ticks every second without a deadline", () => {
    expect(msToNextSecond(undefined, NOW)).toBe(1000);
  });
});

describe("the Draw pill buttons in English (Écart §14, JOURNAL 2026-10-07)", () => {
  // Confirm, sa taille dans le bouton, puis l'attente : « Wait 12 s »
  it("says Confirm with the draft size, then counts down with Wait", () => {
    expect(submitLabel(0, undefined, "en")).toBe("Confirm");
    expect(submitLabel(3, undefined, "en")).toBe("Confirm · 3");
    expect(submitLabel(0, 12, "en")).toBe("Wait 12 s");
    expect(submitLabel(0, 65, "en")).toBe("Wait 1 min 05");
    expect(submitWords(0, 12, "en")).toEqual({ lead: "Wait ", label: "12 s" });
  });
});

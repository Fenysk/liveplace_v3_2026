import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gauge, type GaugeProps } from "./gauge";

const NOW = 1_000_000;
const REFILL = { endsAt: NOW + 12_000, durationMs: 30_000, secondsLeft: 12 };
const FULL: GaugeProps = { charges: 20, max: 20, refill: null, label: "20 / 20 pixels, jauge pleine" };
const REFILLING: GaugeProps = { charges: 8, max: 20, refill: REFILL, label: "8 / 20 pixels" };

const markup = (props: GaugeProps): string => renderToStaticMarkup(createElement(Gauge, props));

// Le texte du tube, une fois par couche : les pixels que tu as sur ta capacité
const tubeTexts = (html: string): string[] =>
  [...html.matchAll(/<span class="lp-gauge-text[^"]*"[^>]*>([^<]*)<\/span>/g)].map(([, text]) => text ?? "");

describe("the number in the tube (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Le nombre dit ce que tu as sur ta capacité, écrit une fois par couche de couleur
  it("says the pixels over the capacity, in each of its three color layers", () => {
    expect(tubeTexts(markup(REFILLING))).toEqual(["8/20", "8/20", "8/20"]);
    expect(tubeTexts(markup({ ...REFILLING, charges: 150, max: 150 }))).toEqual([
      "150/150",
      "150/150",
      "150/150",
    ]);
  });

  // Un brouillon ne change pas le nombre : il se voit par la partie réservée du fluide
  it("keeps the same meaning with a draft, which shows as the reserved fluid", () => {
    const withDraft = markup({ ...REFILLING, draft: 3 });

    expect(tubeTexts(withDraft)).toEqual(["8/20", "8/20", "8/20"]);
    expect(withDraft).toContain("--lp-level:40%");
    expect(withDraft).toContain("--lp-level:25%");
  });
});

describe("the timer of the ring (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Une recharge en cours : les secondes seules dans l'anneau, sans unité
  it("shows the seconds until the next pixel", () => {
    const html = markup(REFILLING);

    expect(html).toContain("lp-gauge-timer-text");
    expect(html).toContain('<span class="lp-visually-hidden">12</span>');
  });

  // À partir d'une minute, « 1:05 »
  it("shows minutes and seconds from a minute", () => {
    const html = markup({ ...REFILLING, refill: { ...REFILL, secondsLeft: 65 } });

    expect(html).toContain('<span class="lp-visually-hidden">1:05</span>');
  });

  // Jauge pleine : l'anneau est plein et muet
  it("shows no number when the gauge is full", () => {
    expect(markup(FULL)).not.toContain("lp-gauge-timer-text");
  });
});

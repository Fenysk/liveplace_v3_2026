import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { CharitySection, type CharitySectionProps } from "./charity-section";

const doNothing = (): void => undefined;

const props = (isEventOnly: boolean): CharitySectionProps => ({
  isEnabled: true,
  isEventOnly,
  statusLine: { text: "En cours", isDanger: false },
  fields: {
    title: "T",
    address: "",
    startDate: "2026-12-05",
    startTime: "20:00",
    endDate: "2026-12-06",
    endTime: "",
  },
  failure: null,
  onInput: doNothing,
  onCommit: doNothing,
  onToggle: doNothing,
  onToggleEventOnly: doNothing,
});

const render = (locale: "fr" | "en", isEventOnly: boolean): string =>
  renderToStaticMarkup(
    createElement(LocaleProvider, { initial: locale }, createElement(CharitySection, props(isEventOnly))),
  );

describe("the event-only checkbox of the event section (JOURNAL 2026-11-21)", () => {
  // Après le début et la fin, avec sa note, dans les deux langues
  it("comes right after the start and the end, with its note, in both languages", () => {
    const fr = render("fr", false);
    expect(fr.indexOf("Dessin seulement pendant l&#x27;événement")).toBeGreaterThan(fr.indexOf("Fin"));
    expect(fr).toContain("Toi, tu dessines toujours.");
    const en = render("en", false);
    expect(en.indexOf("Drawing only during the event")).toBeGreaterThan(en.indexOf("End"));
    expect(en).toContain("You can always draw.");
  });

  // Chaque borne a un champ date et un champ heure ; la fin et les heures sont facultatives, dites dans les deux langues
  it("has a date field and a time field for each bound, and says the end and the times are optional", () => {
    const fr = render("fr", false);
    expect(fr.match(/type="date"/g)).toHaveLength(2);
    expect(fr.match(/type="time"/g)).toHaveLength(2);
    expect(fr).toContain(">Début<");
    expect(fr).toContain(">Fin (facultative)<");
    expect(fr).toContain('aria-label="Heure du début (facultative)"');
    expect(fr).toContain('aria-label="Heure de la fin (facultative)"');
    expect(fr).toContain('<p class="lp-type-caption lp-muted">Heure (facultative)</p>');
    expect(fr).toContain('value="2026-12-05"');
    expect(fr).toContain('value="20:00"');
    const en = render("en", false);
    expect(en).toContain(">Start<");
    expect(en).toContain(">End (optional)<");
    expect(en).toContain('aria-label="Start time (optional)"');
    expect(en).toContain('aria-label="End time (optional)"');
    expect(en).toContain(">Time (optional)<");
  });

  // La légende grise est sous les deux lignes
  it("puts the time note under both lines", () => {
    const fr = render("fr", false);
    expect(fr.indexOf("Heure (facultative)</p>")).toBeGreaterThan(fr.indexOf('aria-label="Heure de la fin'));
  });

  // La case reflète l'état du gateway
  it("shows the flag as checked only when it is on", () => {
    const checkedBoxes = (html: string): number =>
      html.match(/<input[^>]*type="checkbox"[^>]*checked=""/g)?.length ?? 0;

    expect(checkedBoxes(render("fr", true))).toBe(checkedBoxes(render("fr", false)) + 1);
  });
});

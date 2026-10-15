import type { Timestamp } from "@liveplace/domain";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DayChoice } from "./day-choice";
import { DaySwitch } from "./day-switch";

const choice: DayChoice = {
  label: "Hier",
  canGoBack: true,
  canGoForward: true,
  previousAt: 1000,
  nextAt: 3000,
};

const render = (shown: DayChoice): string =>
  renderToStaticMarkup(createElement(DaySwitch, { choice: shown, onSelect: () => undefined }));

// Les deux boutons de la rangée, tels que le composant les décrit : de quoi appeler leur action sans navigateur.
const pressArrows = (shown: DayChoice): (Timestamp | undefined)[] => {
  const asked: (Timestamp | undefined)[] = [];
  const tree = DaySwitch({ choice: shown, onSelect: (dayAt) => asked.push(dayAt) });
  for (const child of Children.toArray(tree.props.children))
    if (isValidElement<{ onPress?: () => void }>(child)) child.props.onPress?.();
  return asked;
};

describe("the choice of the day in the developer window (JOURNAL 2026-10-14)", () => {
  // Met la date entre deux boutons nommés « Jour précédent » et « Jour suivant », et l'annonce quand elle change
  it("puts the date between two buttons named Jour précédent and Jour suivant, and announces it when it changes", () => {
    const markup = render(choice);

    expect(markup).toContain('aria-live="polite"');
    expect(markup.indexOf('aria-label="Jour précédent"')).toBeLessThan(markup.indexOf("Hier"));
    expect(markup.indexOf("Hier")).toBeLessThan(markup.indexOf('aria-label="Jour suivant"'));
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).not.toContain("disabled");
  });

  // Grise chaque flèche qui ne mène nulle part, sans retirer le bouton
  it("greys each arrow that leads nowhere, without removing the button", () => {
    const [back, forward] = render({ ...choice, canGoBack: false })
      .split("<button")
      .slice(1)
      .map((button) => button.includes("disabled"));
    const [, onlyForward] = render({ ...choice, canGoForward: false })
      .split("<button")
      .slice(1)
      .map((button) => button.includes("disabled"));

    expect([back, forward]).toEqual([true, false]);
    expect(onlyForward).toBe(true);
  });

  // Choisit le jour d'avant avec la première flèche, et le jour d'après (ou aujourd'hui) avec la seconde
  it("chooses the day before with the first arrow, and the day after, or today, with the second", () => {
    expect(pressArrows(choice)).toEqual([1000, 3000]);
    expect(pressArrows({ ...choice, nextAt: undefined })).toEqual([1000, undefined]);
  });
});

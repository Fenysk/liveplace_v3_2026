import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const noop = (): void => undefined;
const render = (props: { label: string; reservedLabel?: string; labelLead?: string }): string =>
  renderToStaticMarkup(createElement(Button, { onPress: noop, ...props }));

describe("le bouton qui garde la largeur de son plus long libellé (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Le libellé plus court ne rétrécit pas le bouton : le plus long se réserve, invisible, à côté de lui
  it("reserves the widest label next to the shown one, without saying it twice", () => {
    const markup = render({ label: "Valider · 3", reservedLabel: "Valider · 99" });

    expect(markup).toContain('data-reserve="Valider · 99"');
    expect(markup).toContain("Valider · 3");
    expect(markup).toContain('aria-label="Valider · 3"');
  });

  // Sans réserve, le bouton est ce qu'il était : aucun habillage de plus
  it("adds nothing around the label when nothing is reserved", () => {
    expect(render({ label: "Valider" })).not.toContain("data-reserve");
  });
});

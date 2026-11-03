import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { ThumbnailZoom } from "./thumbnail-zoom";

const doNothing = (): void => undefined;

// `children` est requis par le type du composant : les propriétés se bâtissent à part, `createElement` ne les reçoit pas en littéral.
const zoom = (locale: "fr" | "en" = "fr"): string => {
  const zoomProps: Parameters<typeof ThumbnailZoom>[0] = {
    title: "Le classement",
    onClose: doNothing,
    children: createElement("span", { className: "dessin" }, "le dessin"),
  };
  const localeProps: Parameters<typeof LocaleProvider>[0] = {
    initial: locale,
    children: createElement(ThumbnailZoom, zoomProps),
  };
  return renderToString(createElement(LocaleProvider, localeProps));
};

describe("la vignette agrandie", () => {
  // Un dialogue nommé par le titre de la ligne, fermé tant que l'effet ne l'ouvre pas, sans `style` (CSP de production)
  it("is a dialog named by the title of the line, closed until the browser opens it, with no inline style", () => {
    const html = zoom();

    expect(html).toContain('<dialog class="lp-zoom" aria-label="Le classement">');
    expect(html).not.toContain(" open");
    expect(html).not.toMatch(/\sstyle=/);
  });

  // Le dessin est montré à l'échelle des vignettes agrandies, masqué au lecteur d'écran : le titre le dit déjà
  it("draws the thumbnail at the enlarged scale, hidden from a screen reader, with the title under it", () => {
    const html = zoom();

    expect(html).toContain('<div class="lp-release-shot lp-release-shot--zoomed" aria-hidden="true">');
    expect(html).toContain('<span class="dessin">le dessin</span>');
    expect(html).toMatch(/<figcaption[^>]*>.*Le classement.*<\/figcaption>/s);
    expect(html.indexOf("le dessin")).toBeLessThan(html.indexOf("<figcaption"));
  });

  // Un bouton Fermer, nommé dans la langue de la page, au cas où ni Échap ni un clic à côté ne se trouvent
  it("has a close button named in the language of the page", () => {
    expect(zoom("fr")).toContain('title="Fermer (Échap)"');
    expect(zoom("en")).toContain('title="Close (Esc)"');
    expect(zoom().match(/<button/g)).toHaveLength(1);
  });
});

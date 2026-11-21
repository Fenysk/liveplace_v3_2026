import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type Donation, DonationLine } from "./donation-toast";
import { cycleMsOf, donationDurationMs, formatAmount, formatPixels, pixelsOf } from "./donation-toast-timing";

const noop = (): void => undefined;
const render = (donation: Donation): string =>
  renderToStaticMarkup(createElement(DonationLine, { donation, onClaim: noop }));
// Les espaces insécables de `Intl` deviennent des espaces simples : seul le texte compte ici.
const plain = (text: string): string => text.replace(/[\s  ]/g, " ");

describe("le temps du toast d'un don", () => {
  // Un texte court passe vite : le toast reste au moins 8 s
  it("stays at least 8 s", () => {
    expect(donationDurationMs(null)).toBe(8000);
    expect(donationDurationMs(cycleMsOf(100))).toBe(8000);
  });

  // Un texte long défile deux fois en entier : le départ, plus deux tours
  it("waits for the text to pass twice when that takes longer", () => {
    expect(cycleMsOf(550)).toBe(10000);
    expect(donationDurationMs(10000)).toBe(20600);
  });
});

describe("le montant et les pixels d'un don", () => {
  // 1 € = 10 pixels : 5 € font 50 pixels, arrondi vers le bas
  it("gives ten pixels per euro, rounded down", () => {
    expect(pixelsOf(500)).toBe(50);
    expect(pixelsOf(1500)).toBe(150);
    expect(pixelsOf(1239)).toBe(123);
    expect(pixelsOf(9)).toBe(0);
  });

  // Les décimales seulement quand le montant n'est pas rond
  it("writes the amount in euros, by language", () => {
    expect(plain(formatAmount(500, "fr"))).toBe("5 €");
    expect(plain(formatAmount(1250, "fr"))).toBe("12,50 €");
    expect(formatAmount(500, "en")).toBe("€5");
    expect(formatAmount(1250, "en")).toBe("€12.50");
  });

  it("groups the thousands of pixels", () => {
    expect(plain(formatPixels(1250, "fr"))).toBe("1 250");
    expect(formatPixels(1250, "en")).toBe("1,250");
  });
});

describe("la ligne d'un don affichée", () => {
  // Le pseudo est un texte libre : jamais du HTML
  it("shows the donor name as text, never as markup", () => {
    const markup = render({ id: 1, donor: "<img src=x onerror=alert(1)>", amountCents: 500 });

    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  // Sans don, la ligne est fermée : plus de cœur, de pseudo ni de bouton ; la région d'état reste, vide, pour le don suivant
  it("is closed without a donation, and keeps its empty status region", () => {
    const markup = renderToStaticMarkup(createElement(DonationLine, { donation: null, onClaim: noop }));

    expect(markup).toBe('<div role="status" class="lp-visually-hidden"></div>');
  });

  // Un don remplace l'autre dans la ligne ouverte : une seule ligne, celle du don affiché
  it("shows one line, the one of the donation shown", () => {
    const markup = render({ id: 2, donor: "mxtt", amountCents: 1250 });

    expect(markup.match(/class="lp-donation /g)).toHaveLength(1);
    expect(markup).toContain("mxtt");
  });

  // Le montant en gras, deux copies du texte dont la seconde est muette, et le +N à réclamer
  it("writes the sentence twice, the amount in bold, and offers the claim", () => {
    const markup = render({ id: 1, donor: "lunaa", amountCents: 500 });

    expect(markup.match(/<strong>5/g)).toHaveLength(2);
    expect(markup).toContain('class="lp-donation-copy lp-donation-copy--twin" aria-hidden="true"');
    expect(markup).toMatch(/class="lp-btn lp-claim[^"]*"[^>]*><span[^>]*>\+50</);
  });

  // Une phrase entière dans la région d'état : le pseudo, puis le remerciement
  it("announces the whole sentence once, donor first", () => {
    const markup = renderToStaticMarkup(
      createElement(DonationLine, {
        donation: { id: 1, donor: "lunaa", amountCents: 500 },
        onClaim: noop,
      }),
    );

    expect(plain(markup)).toContain(
      '<div role="status" class="lp-visually-hidden"><span>lunaa. Un grand merci pour ce don de 5 € ! 50 pixels offerts à toute la fresque.</span></div>',
    );
  });

  // Un compte sans bonus à réclamer (invité) lit le don sans bouton
  it("has no claim button without a claim to make", () => {
    const markup = renderToStaticMarkup(
      createElement(DonationLine, {
        donation: { id: 1, donor: "lunaa", amountCents: 500 },
      }),
    );

    expect(markup).not.toContain("lp-claim");
  });

  // Un don de 15 $ sans `pixels` dans la frame : 150 pixels offerts, dits dans la région d'état
  it("announces 150 pixels for a donation of 15 dollars", () => {
    const markup = render({ id: 1, donor: "lunaa", amountCents: 1500, currency: "USD" });

    expect(plain(markup)).toContain("150 pixels offerts à toute la fresque.");
  });

  // Le +N est le bonus en attente, pas le don seul ; la devise et les pixels sont ceux du don
  it("writes the pending bonus in the button, and the currency and pixels of the donation", () => {
    const markup = renderToStaticMarkup(
      createElement(DonationLine, {
        donation: { id: 1, donor: "lunaa", amountCents: 500, currency: "USD", pixels: 50 },
        onClaim: noop,
        claimPixels: 1200,
      }),
    );

    expect(plain(markup)).toMatch(/\+1 200</);
    expect(plain(markup)).toContain("5 $US");
  });
});

describe("la devise d'un don", () => {
  it("falls back to the plain code when the language does not know it", () => {
    expect(formatAmount(1250, "fr", "??")).toBe("12.50 ??");
  });
});

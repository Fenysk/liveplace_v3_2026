import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "../locale/locale";
import { LocaleProvider } from "../locale/use-locale";
import { HomePage } from "./home-page";
import { HOME_TEXTS } from "./home-texts";

// Un attribut `style` : la CSP de production (`default-src 'self'`, sans `style-src`) bloque celui du HTML que le serveur
// écrit. React, lui, pose `style` par le CSSOM, que la CSP laisse : la jauge et la palette n'arrivent qu'après l'hydratation.
const INLINE_STYLE = /\sstyle=/;

const serverHtml = (locale: Locale = "fr"): string =>
  renderToString(createElement(LocaleProvider, { initial: locale }, createElement(HomePage)));

// Le faux stream : tout ce que le serveur écrit de l'écran, jusqu'au téléphone
const monitorOf = (html: string): string =>
  html.slice(html.indexOf('<div class="lp-home-monitor"'), html.indexOf('<div class="lp-home-phone"'));

describe("the HTML the server writes for the home page (CSP of production)", () => {
  // Aucun attribut `style` dans la page entière : le mot-symbole, le stream, le bouton, et la place du téléphone
  it("carries no inline style, in either language", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = serverHtml(locale);

      expect(html).toContain("lp-home-monitor"); // le stream est bien rendu : le garde-fou ne regarde pas dans le vide
      expect(html).toContain("lp-home-phone");
      expect(html).not.toMatch(INLINE_STYLE);
    }
  });

  // Ce que la CSP refuserait (la jauge et la palette posent des `style`) n'est pas dans le HTML du serveur : le téléphone se monte ensuite
  it("leaves the gauge and the palette to the browser, and keeps the room of the phone", () => {
    const html = serverHtml();

    expect(html).not.toContain("lp-gauge");
    expect(html).not.toContain("lp-palette");
    expect(html).toContain("lp-home-screen");
  });

  // La phrase, le bouton vers `/auth/twitch` et la ligne de la politique : rien d'autre à gauche, ni sous-titre ni légende
  it("writes the sentence, the Twitch sign-in button and the privacy line", () => {
    const html = serverHtml();

    expect(html).toContain("Tes viewers dessinent sur ton stream.");
    expect(html).toMatch(
      /<a[^>]*class="[^"]*lp-btn--twitch[^"]*"[^>]*href="\/auth\/twitch"|<a[^>]*href="\/auth\/twitch"[^>]*class="[^"]*lp-btn--twitch/,
    );
    expect(html).toContain("Lancer ma fresque");
    expect(html).toContain("politique de confidentialité");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  // L'interface est bilingue : chaque texte a sa version anglaise
  it("says everything in English when the page is in English", () => {
    const html = serverHtml("en");

    expect(html).toContain("Your viewers draw on your stream.");
    expect(html).toContain("Start my canvas");
    expect(html).toContain("privacy policy");
    expect(html).not.toMatch(/Tes viewers|Lancer ma fresque|confidentialité/);
  });

  // Aucune référence explicite à un stream précis : ni texte, ni nom, ni logo, ni violet de marque dans le faux stream
  it("writes no text, no name and no brand in the fake stream", () => {
    const monitor = monitorOf(serverHtml());

    expect(monitor.length).toBeGreaterThan(1000);
    expect(monitor.replace(/<[^>]*>/g, "").trim()).toBe("");
    expect(monitor).not.toMatch(/twitch|<svg|<img|<a /i);
    expect(monitor).toContain('aria-hidden="true"');
  });

  // « LivePlace » est un mot-symbole : du texte en haut à gauche, avant la phrase, sans pill, sans icône, sans aucune forme
  it("writes LivePlace as a plain wordmark at the top, with no pill, no icon and no shape", () => {
    const html = serverHtml();
    const wordmarkStart = html.indexOf('<p class="lp-type-display lp-home-wordmark">');
    const block = html.slice(wordmarkStart, html.indexOf("</p>", wordmarkStart));

    expect(html).toContain('<p class="lp-type-display lp-home-wordmark">LivePlace</p>');
    expect(block.replace(/<[^>]*>/g, "").trim()).toBe("LivePlace");
    expect(block).not.toMatch(/lp-pill|<svg|<i[ >]|lp-home-logo|lp-home-mark/);
    expect(html.indexOf("lp-home-wordmark")).toBeLessThan(html.indexOf("lp-home-monitor"));
  });

  // En haut à droite, en face du mot-symbole : la langue (les deux choix, et un bouton qui les remplace sur un téléphone) et l'apparence
  it("writes the language and the appearance across from the wordmark, before the sentence", () => {
    for (const [locale, words] of [
      ["fr", { picker: "Langue", tip: "Langue : Français", code: "FR", appearance: "Apparence : Auto" }],
      ["en", { picker: "Language", tip: "Language: English", code: "EN", appearance: "Appearance: Auto" }],
    ] as const) {
      const html = serverHtml(locale);
      const settings = html.slice(html.indexOf('<div class="lp-home-settings">'), html.indexOf("<h1"));

      expect(html.indexOf("lp-home-wordmark")).toBeLessThan(html.indexOf("lp-home-settings"));
      expect(settings).toContain(`role="radiogroup" aria-label="${words.picker}"`);
      expect(settings).toContain("Français");
      expect(settings).toContain("English");
      expect(settings).toMatch(new RegExp(`checked=""[^>]*value="${locale}"`));
      expect(settings).toContain(`title="${words.tip}"`);
      expect(settings).toContain(`<span>${words.code}</span>`);
      expect(settings).toContain(`title="${words.appearance}"`);
      expect(settings.match(/<button/g)).toHaveLength(2);
    }
  });

  // Le lecteur : un fond uni et un streamer filmé en silhouette, une tête ronde et des épaules, rien d'autre (ni décor, ni visage)
  it("shows a bust silhouette in the player and no landscape", () => {
    const monitor = monitorOf(serverHtml());

    expect(monitor.match(/class="lp-home-person"/g)).toHaveLength(1);
    expect(monitor.match(/lp-home-person-/g)).toHaveLength(2);
    expect(monitor).toContain("lp-home-person-head");
    expect(monitor).toContain("lp-home-person-shoulders");
    expect(monitor).not.toMatch(/hill|sky|face|mic/);
  });
});

describe("the words of the home page", () => {
  // Retour 5 d'Alexis : aucun « délai » écrit nulle part, il n'existe que par le vol de 0,5 s
  it("never writes a delay: it exists only through the flight", () => {
    for (const locale of ["fr", "en"] as const) {
      const sentences = Object.values(HOME_TEXTS[locale]).join(" ");

      expect(sentences).not.toMatch(/d[ée]lai|delay|latenc|lag\b/i);
      expect(serverHtml(locale)).not.toMatch(/d[ée]lai|delay|latenc/i);
    }
  });

  // « fresque », « dessin », « viewer » : jamais joueur, compte, utilisateur, multi-sélection (anglais : canvas, drawing, viewer)
  it("uses the words of the product", () => {
    expect(HOME_TEXTS.fr.start).toContain("fresque");
    expect(HOME_TEXTS.fr.headline).toContain("viewers");
    expect(HOME_TEXTS.en.start).toContain("canvas");
    expect(HOME_TEXTS.en.headline).toContain("viewers");
    for (const locale of ["fr", "en"] as const)
      expect(Object.values(HOME_TEXTS[locale]).join(" ")).not.toMatch(
        /joueur|compte|utilisateur|multi-s[ée]lection|player|account|user/i,
      );
  });
});

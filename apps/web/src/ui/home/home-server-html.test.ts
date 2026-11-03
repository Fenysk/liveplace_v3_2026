import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(html).toContain("Lancer ma fresque avec Twitch");
    expect(html).toContain("politique de confidentialité");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  // §9.10 : le bouton dit qu'il va chez Twitch, et son nom accessible est son texte visible, sans `title` qui le contredise
  it("names the sign-in button by its visible text alone, and opens the privacy policy in the same tab", () => {
    for (const [locale, text] of [
      ["fr", "Lancer ma fresque avec Twitch"],
      ["en", "Start my canvas with Twitch"],
    ] as const) {
      const html = serverHtml(locale);
      const button = html.match(/<a [^>]*href="\/auth\/twitch"[^>]*>.*?<\/a>/)?.[0] ?? "";
      const note = html.match(/<a [^>]*href="\/confidentialite"[^>]*>/)?.[0] ?? "";

      expect(button.replace(/<[^>]*>/g, "")).toBe(text);
      expect(button).not.toMatch(/\stitle=|aria-label/);
      expect(note).not.toMatch(/target|rel=/);
    }
  });

  // L'interface est bilingue : chaque texte a sa version anglaise
  it("says everything in English when the page is in English", () => {
    const html = serverHtml("en");

    expect(html).toContain("Your viewers draw on your stream.");
    expect(html).toContain("Start my canvas with Twitch");
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
    const wordmarkStart = html.indexOf('<p class="lp-type-display lp-wordmark">');
    const block = html.slice(wordmarkStart, html.indexOf("</p>", wordmarkStart));

    expect(html).toContain('<p class="lp-type-display lp-wordmark">LivePlace</p>');
    expect(block.replace(/<[^>]*>/g, "").trim()).toBe("LivePlace");
    expect(block).not.toMatch(/lp-pill|<svg|<i[ >]|lp-home-logo|lp-home-mark/);
    expect(html.indexOf("lp-wordmark")).toBeLessThan(html.indexOf("lp-home-monitor"));
  });

  // En haut à droite, en face du mot-symbole : la langue (les deux choix, et un bouton qui les remplace sur un téléphone) et l'apparence
  it("writes the language and the appearance across from the wordmark, before the sentence", () => {
    for (const [locale, words] of [
      [
        "fr",
        { picker: "Langue", tip: "Langue\u00a0: Français", code: "FR", appearance: "Apparence\u00a0: Auto" },
      ],
      ["en", { picker: "Language", tip: "Language: English", code: "EN", appearance: "Appearance: Auto" }],
    ] as const) {
      const html = serverHtml(locale);
      const settings = html.slice(html.indexOf('<div class="lp-home-settings">'), html.indexOf("<h1"));

      expect(html.indexOf("lp-wordmark")).toBeLessThan(html.indexOf("lp-home-settings"));
      expect(settings).toContain(`role="radiogroup" aria-label="${words.picker}"`);
      expect(settings).toContain("Français");
      expect(settings).toContain("English");
      expect(settings).toMatch(new RegExp(`checked=""[^>]*value="${locale}"`));
      expect(settings).toContain(`title="${words.tip}"`);
      expect(settings).toContain(`<span>${words.code}</span>`);
      expect(settings).toContain(`title="${words.appearance}"`);
      expect(settings.match(/<button/g)).toHaveLength(2);
      // Soutenir est à gauche, avec le mot-symbole : les réglages n'ont ni son bouton ni sa fenêtre
      expect(settings).not.toMatch(/lp-btn--support|lp-home-support|<dialog/);
    }
  });

  // CDC 2026, Soutenir LivePlace : à gauche, juste après le mot-symbole et avant les réglages, un bouton qui ouvre la fenêtre (vide
  // tant qu'elle est fermée : aucun lien vers Ko-fi dans la page). Le nom est écrit à côté : le texte dit « Soutenir ». Le serveur
  // écrit les deux formes (le texte et le cœur seul), home.css montre celle qui tient sur un téléphone.
  it("writes Support right after the wordmark, before the settings, a button that opens its window, in both forms", () => {
    for (const [locale, short, full] of [
      ["fr", "Soutenir", "Soutenir LivePlace"],
      ["en", "Support", "Support LivePlace"],
    ] as const) {
      const html = serverHtml(locale);
      const header = html.slice(html.indexOf('<div class="lp-home-header">'), html.indexOf("<h1"));
      const brand = header.slice(
        header.indexOf('<div class="lp-home-brand">'),
        header.indexOf('<div class="lp-home-settings">'),
      );
      const formOf = (form: string): string => {
        const start = brand.indexOf(`<div class="lp-home-support lp-home-support--${form}">`);
        return brand.slice(start, brand.indexOf("</div>", start));
      };
      const label = formOf("label");
      const icon = formOf("icon");
      const buttons = brand.match(/<button [^>]*lp-btn--support[^>]*>/g) ?? [];

      // Le mot-symbole, puis le texte, le cœur seul et la fenêtre dans le même groupe, puis les réglages
      expect(header).toMatch(
        /^<div class="lp-home-header"><div class="lp-home-brand"><p class="lp-type-display lp-wordmark">LivePlace<\/p><div class="lp-home-support lp-home-support--label">/,
      );
      expect(brand).toMatch(/<\/dialog><\/div>$/);
      expect(header.indexOf("lp-wordmark")).toBeLessThan(header.indexOf("lp-home-support--label"));
      expect(header.indexOf("lp-home-support--label")).toBeLessThan(header.indexOf("lp-home-support--icon"));
      expect(header.indexOf("lp-home-support--icon")).toBeLessThan(header.indexOf("<dialog"));
      expect(header.indexOf("<dialog")).toBeLessThan(header.indexOf("lp-home-settings"));
      expect(buttons).toHaveLength(2);
      for (const button of buttons) expect(button).toContain('type="button"');
      // Le seul lien de l'en-tête est celui des Nouveautés : Ko-fi ne s'ouvre que depuis la fenêtre
      expect(header.match(/<a [^>]*>/g) ?? []).toEqual([expect.stringContaining('href="/nouveautes"')]);
      expect(header).not.toMatch(/ko-fi\.com|target=/);
      // Une seule fenêtre, hors des deux formes dont le CSS cache l'une : ouverte puis cachée au passage de 640 px, elle disparaîtrait
      // en laissant la page inerte
      expect(header.match(/<dialog [^>]*><\/dialog>/g)).toHaveLength(1);
      expect(header.match(/<dialog/g)).toHaveLength(1);
      for (const form of [label, icon]) {
        expect(form).toContain("<button");
        expect(form).not.toContain("<dialog");
      }
      // Le texte dit « Soutenir » et se nomme par ce texte ; le cœur seul garde le nom complet, en titre et en nom accessible
      expect(label).toContain(`<span>${short}</span>`);
      expect(label).not.toMatch(/\stitle=|aria-label|LivePlace/);
      expect(icon).not.toContain("<span>");
      expect(icon).toMatch(
        new RegExp(`title="${full}"[^>]*aria-label="${full}"|aria-label="${full}"[^>]*title="${full}"`),
      );
      expect(header.match(new RegExp(full, "g"))).toHaveLength(2);
    }
    expect(serverHtml("en")).not.toMatch(/Soutenir/);
  });

  // Le groupe de gauche : le mot-symbole et Soutenir côte à côte, centrés sur la ligne, qui peut rétrécir
  it("lines up the wordmark and Support on the left, centred, in a group that can shrink", () => {
    const css = readFileSync(join(import.meta.dirname, "home.css"), "utf8").replace(/\s+/g, " ");

    expect(css).toContain(
      ".lp-home-brand { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }",
    );
  });

  // Sous 400 px de large (un téléphone de 360 px : 328 px), le mot-symbole passe à 24 px par les jetons de la taille « display » et le
  // groupe se resserre ; sans cela, Soutenir et les trois réglages font une page de 376 px
  it("brings the wordmark to 24 px through the display tokens and tightens the left group under 400 px", () => {
    const css = readFileSync(join(import.meta.dirname, "home.css"), "utf8").replace(/\s+/g, " ");

    expect(css).toContain(
      "@container lp-home (max-width: 400px) { .lp-home-brand { gap: var(--space-2); } .lp-home-brand .lp-wordmark { --type-display-size: 24px; --type-display-line: 28px; } }",
    );
    expect(css).not.toMatch(/\.lp-home-brand[^}]*font-size/);
  });

  // Sur un téléphone, le cœur seul : home.css cache le texte et montre le cœur dans la même requête que la langue
  it("shows only the heart on a phone, with the same container query as the language", () => {
    const css = readFileSync(join(import.meta.dirname, "home.css"), "utf8").replace(/\s+/g, " ");

    expect(css).toContain(".lp-home-locale--cycle, .lp-home-support--icon { display: none; }");
    expect(css).toContain(
      "@container lp-home (max-width: 640px) { .lp-home-locale--choices, .lp-home-support--label { display: none; } .lp-home-locale--cycle, .lp-home-support--icon { display: block; } }",
    );
  });

  // À 320 px, le mot-symbole et trois contrôles de 44 px ne tiennent sur une ligne que si les réglages se rapprochent
  it("brings the three controls closer on a 320 px phone, so the wordmark and they fit on one line", () => {
    const css = readFileSync(join(import.meta.dirname, "home.css"), "utf8").replace(/\s+/g, " ");

    expect(css).toContain(
      "@container lp-home (max-width: 320px) { .lp-home-settings { gap: var(--space-1); } }",
    );
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
    expect(HOME_TEXTS.fr.start).toBe("Lancer ma fresque avec Twitch");
    expect(HOME_TEXTS.en.start).toBe("Start my canvas with Twitch");
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

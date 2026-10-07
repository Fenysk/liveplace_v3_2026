import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Profile, type ProfileUser, type ProfileVariant } from "./profile";

// Un attribut `style` : la CSP de production bloque celui du HTML que le serveur écrit (archive-server-html.test.ts).
const INLINE_STYLE = /\sstyle=/;

const user: ProfileUser = { displayName: "Kalyss", login: "kalyss" };

const render = (profile: ProfileUser, variant?: ProfileVariant) =>
  renderToString(createElement(Profile, { user: profile, ...(variant ? { variant } : {}) }));

const twitchLinks = (html: string) => [
  ...html.matchAll(/<a [^>]*href="https:\/\/www\.twitch\.tv\/[^"]*"[^>]*>/g),
];

describe("the Twitch button of a profile, when the person is not live", () => {
  // Hors live, rien ne change : le bouton fantôme avec le logo, sur PC seulement, et pas de variante live
  it("is the ghost button with the logo on desktop, and nothing on the compact variant", () => {
    const full = render(user, "full");
    const compact = render(user, "name");

    expect(twitchLinks(full)).toHaveLength(1);
    expect(full).toContain('title="Chaîne Twitch de Kalyss"');
    expect(full).toContain("lp-btn--ghost");
    expect(full).not.toContain("lp-btn--live");
    expect(full).not.toContain("lp-twitch-eye");
    expect(twitchLinks(compact)).toHaveLength(0);
  });
});

describe("the Twitch button of a profile, when the person is live (Écart §4, JOURNAL 2026-10-07)", () => {
  const live: ProfileUser = { ...user, twitchLive: { category: "Art" } };

  // En live, le bouton devient celui de la chaîne, nouvel onglet, avec la catégorie et l'infobulle qui dit tout
  it("becomes the link to the channel in a new tab, with the category and a title that says it all", () => {
    const html = render(live, "full");

    expect(twitchLinks(html)).toHaveLength(1);
    expect(html).toContain('href="https://www.twitch.tv/kalyss"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('title="Kalyss est en live sur Twitch : Art"');
    expect(html).toContain('aria-label="Kalyss est en live sur Twitch : Art"');
    expect(html).toContain('<span class="lp-live-category">Art</span>');
    expect(html).toContain("lp-btn--live");
    expect(html).not.toContain("lp-btn--ghost");
  });

  // Le logo en live a son rond et ses deux yeux à part, qui clignent ; l'écran de lecture ne lit que le bouton
  it("carries the dot and the two eyes of the glitch apart from its outline, hidden from screen readers", () => {
    const html = render(live, "full");

    expect(html.match(/lp-twitch-eye/g)).toHaveLength(2);
    expect(html).toContain("lp-twitch-live-dot");
    expect(html).toMatch(/<span class="lp-twitch-live-glyph"><svg [^>]*aria-hidden="true"/);
  });

  // Sans catégorie, le bouton dit « En live » et l'infobulle se tait sur la catégorie
  it("says « En live » without a category, and its title names no category", () => {
    const html = render({ ...user, twitchLive: { category: "" } }, "full");

    expect(html).toContain('<span class="lp-live-category">En live</span>');
    expect(html).toContain('title="Kalyss est en live sur Twitch"');
    expect(html).toContain('aria-label="Kalyss est en live sur Twitch"');
  });

  // Sur la variante compacte, sans logo hors live, le bouton teinté paraît quand même
  it("shows up on the compact variant too, which has no logo when not live", () => {
    for (const variant of ["name", "avatar"] as const)
      expect(twitchLinks(render(live, variant))).toHaveLength(1);
  });

  // Une catégorie est du texte, jamais du balisage
  it("writes a category as text, never as markup", () => {
    const html = render({ ...user, twitchLive: { category: "<b>Art</b> & Co" } }, "full");

    expect(html).toContain("&lt;b&gt;Art&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<b>Art</b>");
  });

  // Aucun `style` dans le HTML du serveur : les couleurs et le détourage passent par des classes et des tokens
  it("carries no inline style in the HTML the server writes", () => {
    expect(render(live, "full")).not.toMatch(INLINE_STYLE);
    expect(render(live, "name")).not.toMatch(INLINE_STYLE);
  });
});

describe("the live styles (tokens.css, twitch.css)", () => {
  const tokens = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
  const twitchCss = readFileSync(join(import.meta.dirname, "twitch.css"), "utf8");
  const blockOf = (opening: string): string => {
    const start = tokens.indexOf(opening);
    return tokens.slice(start, tokens.indexOf("\n}", start));
  };
  const light = blockOf(':root,\n[data-appearance="light"] {');
  const dark = blockOf('[data-appearance="dark"] {');
  const brand = blockOf(":root {\n  --space-1");

  const toRgb = (hex: string): number[] =>
    [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (rgb: number[]): number => {
    const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const contrast = (first: number[], second: number[]): number => {
    const [high = 0, low = 0] = [luminance(first), luminance(second)].sort((left, right) => right - left);
    return (high + 0.05) / (low + 0.05);
  };
  const tokenValue = (block: string, name: string): string =>
    new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? "";

  // Chaque thème donne les trois jetons du live : le fond, son survol, et l'encre de la catégorie
  it("gives the three live tokens to each theme", () => {
    for (const block of [light, dark])
      for (const name of ["--twitch-live-bg", "--twitch-live-bg-hover", "--twitch-live-ink"])
        expect(tokenValue(block, name)).not.toBe("");
  });

  // L'encre de la catégorie tient le contraste AA (4,5:1) sur le fond teinté, au repos et au survol, dans les deux thèmes
  it("keeps the category ink at AA contrast (4.5:1) on the tinted background, resting and hovered, in both themes", () => {
    const twitch = toRgb(tokenValue(brand, "--twitch"));
    for (const block of [light, dark]) {
      const surface = toRgb(tokenValue(block, "--pill-surface"));
      const ink = toRgb(tokenValue(block, "--twitch-live-ink"));
      for (const name of ["--twitch-live-bg", "--twitch-live-bg-hover"]) {
        const share = Number(/var\(--twitch\) (\d+)%/.exec(tokenValue(block, name))?.[1]) / 100;
        const tinted = twitch.map((channel, index) => channel * share + (surface[index] ?? 0) * (1 - share));
        expect(contrast(ink, tinted)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // Le fond est le violet à 16 % sur la pill, 24 % au survol
  it("tints the background at 16 %, and 24 % when hovered", () => {
    for (const block of [light, dark]) {
      expect(tokenValue(block, "--twitch-live-bg")).toBe(
        "color-mix(in srgb, var(--twitch) 16%, var(--pill-surface))",
      );
      expect(tokenValue(block, "--twitch-live-bg-hover")).toBe(
        "color-mix(in srgb, var(--twitch) 24%, var(--pill-surface))",
      );
    }
  });

  // La catégorie est coupée à 170 px, 64 px sur l'écran étroit ou tactile : la requête de `--control-size`
  it("cuts the category at 170 px, 64 px on a narrow or touch screen, with the media query of --control-size", () => {
    const query = "(max-width: 640px), (pointer: coarse)";

    expect(tokens).toContain(`@media ${query} {\n  :root {\n    --control-size:`);
    expect(twitchCss).toMatch(/\.lp-live-category \{[^}]*max-width: 170px;[^}]*text-overflow: ellipsis;/);
    expect(twitchCss).toMatch(
      /@media \(max-width: 640px\), \(pointer: coarse\) \{\s*\.lp-live-category \{\s*max-width: 64px;/,
    );
  });

  // Le clin d'œil : en CSS seul, repris au survol d'une souris, et figé quand le mouvement est réduit
  it("blinks in CSS alone, blinks again on a mouse hover, and holds still under reduced motion", () => {
    expect(twitchCss).toMatch(/\.lp-twitch-eye \{[^}]*animation: lp-twitch-blink 3\.2s infinite;/);
    expect(twitchCss).toMatch(
      /@media \(hover: hover\) \{\s*\.lp-btn--live:hover \.lp-twitch-eye \{\s*animation-name: lp-twitch-blink-hover;/,
    );
    expect(twitchCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.lp-twitch-eye,\s*\.lp-btn--live:hover \.lp-twitch-eye \{\s*animation: none;/,
    );
    expect(twitchCss).toMatch(/@keyframes lp-twitch-blink \{[^}]*\}[^}]*scaleY\(0\.1\)/s);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_WIDTHS } from "./chat-lines";
import { DEMO_COLOR } from "./home-art";
import { DEMO_PALETTE } from "./home-demo";

const css = readFileSync(join(import.meta.dirname, "home.css"), "utf8");

describe("the tones of the home page (CSP of production)", () => {
  // Une case et un pixel en vol prennent leur couleur d'une classe, jamais d'un `style` : chaque teinte de la
  // démo a la sienne, et c'est celle de la palette de `domain`
  it("gives every color of the demo a class that holds its color of the domain palette", () => {
    const indexes = Object.values(DEMO_COLOR);

    expect(indexes).toHaveLength(6);
    for (const index of indexes) {
      const tone = new RegExp(
        `\\.lp-home-tone-${index}\\s*\\{[^}]*--lp-tone:\\s*(#[0-9a-f]{6})\\s*;`,
        "i",
      ).exec(css);

      expect(tone?.[1]?.toLowerCase(), `lp-home-tone-${index}`).toBe(DEMO_PALETTE[index]?.toLowerCase());
    }
  });

  // Les largeurs des lignes du tchat sont des classes aussi : le tchat n'est jamais à la merci d'une largeur oubliée
  it("gives every width of a chat line its class", () => {
    for (const width of CHAT_WIDTHS)
      expect(css, `lp-home-line--${width}`).toMatch(
        new RegExp(`\\.lp-home-line--${width}\\s+\\.lp-home-bar--text\\s*\\{[^}]*width:`),
      );
  });

  // Tout ce qui bouge passe par WAAPI en pixels concrets : aucun @keyframes, qui saccaderait avec une variable
  it("animates nothing in CSS", () => {
    expect(css).not.toMatch(/@keyframes|animation\s*:/);
  });

  // Le violet de Twitch n'est que dans le bouton de connexion, jamais dans la scène
  it("never writes the Twitch violet", () => {
    expect(css).not.toMatch(/#9146ff|#772ce8|var\(--twitch/i);
  });

  // Ni logo ni pill autour de « LivePlace », ni collines : le mot est du texte, le lecteur un fond uni et une silhouette
  it("keeps no logo mark and no landscape, only a wordmark and a silhouette", () => {
    expect(css).not.toMatch(/lp-home-(logo|mark|hill)|--lp-home-(sky|hill)/);
    expect(css).toMatch(/\.lp-home-wordmark\s*\{/);
    expect(css).toMatch(/\.lp-home-person-head\s*\{[^}]*border-radius:\s*50%/);
    expect(css).toMatch(/\.lp-home-person-shoulders\s*\{[^}]*border-radius:/);
  });
});

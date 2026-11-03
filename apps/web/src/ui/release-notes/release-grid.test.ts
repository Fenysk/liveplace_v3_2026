import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// La page `/nouveautes` : des cartes (la vignette en haut à toute la largeur de la carte, le texte dessous), en 2 colonnes dès 760 px de
// bloc et 3 dès 1100 px. Tout est dans release-notes.css, sous `.lp-releases--grid` (la fenêtre n'a pas cette classe), et les colonnes
// sous des requêtes de conteneur du bloc de l'accueil.

const designFile = (name: string): string =>
  readFileSync(join(import.meta.dirname, "../design", name), "utf8").replace(/\s+/g, " ");
const css = designFile("release-notes.css");
const tokens = designFile("tokens.css");

const MEDIUM = "@container lp-home (min-width: 760px)";
const LARGE = "@container lp-home (min-width: 1100px)";

// Le corps du premier bloc qui commence par `header`, accolades appariées
const bodyOf = (source: string, header: string): string => {
  const start = source.indexOf(header);
  const open = source.indexOf("{", start);
  if (start < 0 || open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(open + 1, index);
  }
  return "";
};

// La feuille sans ses requêtes de conteneur : ce qui vaut à toute largeur
const withoutQueries = (source: string): string => {
  let rest = source;
  for (let start = rest.indexOf("@container"); start >= 0; start = rest.indexOf("@container")) {
    const body = bodyOf(rest.slice(start), "@container");
    rest = rest.slice(0, start) + rest.slice(start + rest.slice(start).indexOf("{") + body.length + 2);
  }
  return rest;
};

describe("les cartes de la page des Nouveautés (CSS)", () => {
  // La fenêtre ne change pas : une règle de carte ou de cellule n'existe que sous `.lp-releases--grid`, que seule la page porte
  it("keeps the window as it was: a card or cell rule exists only under .lp-releases--grid", () => {
    const bare = css.match(/(?<!\.lp-releases--grid )\.lp-release-(?:entry|shot-cell)\b/g);

    expect(bare).toBeNull();
    expect(css).toContain(".lp-releases--grid .lp-release-entry {");
    expect(css).toContain(".lp-releases--grid .lp-release-shot-cell {");
    expect(css).toContain(MEDIUM);
    expect(css).toContain(LARGE);
  });

  // Une carte par ligne sur un écran étroit (la colonne de 600 px), puis 2 colonnes dès 760 px de bloc, 3 dès 1100 px
  it("stacks the cards in one column, then makes two columns from 760 px of block and three from 1100 px", () => {
    const base = withoutQueries(css);

    expect(base).toMatch(
      /\.lp-releases--grid \.lp-release-lines \{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(bodyOf(css, MEDIUM)).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(bodyOf(css, LARGE)).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
  });

  // La colonne passe de 600 à 960 puis 1200 px
  it("widens the column from 600 to 960 then 1200 px", () => {
    expect(withoutQueries(css)).toMatch(/\.lp-release-column \{[^}]*max-width: 600px;/);
    expect(bodyOf(css, MEDIUM)).toMatch(/\.lp-release-column \{ max-width: 960px; \}/);
    expect(bodyOf(css, LARGE)).toMatch(/\.lp-release-column \{ max-width: 1200px; \}/);
  });

  // La vignette en haut, à toute la largeur de sa carte : la cellule est un conteneur à toute largeur, l'échelle en vient, sauf à l'agrandissement
  it("puts the thumbnail on top, as wide as its card, and leaves the enlarged one to its own scale", () => {
    const base = withoutQueries(css);

    expect(base).toMatch(/\.lp-releases--grid \.lp-release-shot-cell \{ container-type: inline-size; \}/);
    expect(base).toMatch(
      /\.lp-release-shot-cell \.lp-release-shot:not\(\.lp-release-shot--zoomed\) \{ --lp-u: calc\(100cqw \/ 112\); \}/,
    );
    expect(base).toMatch(/\.lp-releases--grid \.lp-release-entry \{[^}]*display: grid;/);
  });

  // Une carte n'est pas une ligne : sans filet, sans la hauteur d'un contrôle, sans marge intérieure
  it("is not a row: no rule between cards, no control height, no padding", () => {
    const entry = withoutQueries(css).match(/\.lp-releases--grid \.lp-release-entry \{([^}]*)\}/)?.[1] ?? "";

    expect(entry).toContain("border-top: 0;");
    expect(entry).toContain("min-height: 0;");
    expect(entry).toContain("padding: 0;");
  });

  // Le classement agrandi reste lisible : son échelle est plafonnée dans sa carte, les autres vignettes remplissent la leur
  it("caps the scoreboard scale in its card so the enlarged names stay readable", () => {
    expect(withoutQueries(css)).toMatch(
      /\.lp-release-podium \{ --lp-u: min\(calc\(100cqw \/ 112\), 2\.5px\); \}/,
    );
  });

  // L'agrandissement est dans la cellule, comme son dialogue : le plafond ne lui vaut pas, il garde sa propre échelle
  it("leaves the scoreboard of the enlarged view at the scale of the enlarged view", () => {
    expect(withoutQueries(css)).toMatch(
      /\.lp-release-shot:not\(\.lp-release-shot--zoomed\) \.lp-release-podium \{ --lp-u: min\(/,
    );
  });

  // Les pills des vignettes (Modération, Dessin, Soutenir) plafonnent de même à 2,5 px par unité sur la page, pas dans la fenêtre
  it("caps the pills of the thumbnails at 2.5 px per unit on the page, and nowhere else", () => {
    const base = withoutQueries(css);

    expect(base).toMatch(/\.lp-release-scene \{[^}]*--lp-release-pu: var\(--lp-u\);/);
    expect(base).toMatch(
      /\.lp-releases--grid \.lp-release-shot-cell \.lp-release-shot:not\(\.lp-release-shot--zoomed\) \.lp-release-scene \{ --lp-release-pu: min\(var\(--lp-u\), 2\.5px\); \}/,
    );
  });

  // Soutenir LivePlace n'est pas dans les Nouveautés : ni la règle de son bouton, ni ses jetons, ni son rose, nulle part dans ces feuilles
  it("holds no rule and no token of the support button", () => {
    expect(css).not.toContain(".lp-release-support");
    expect(css).not.toContain(".lp-btn--support");
    expect(css).not.toContain("--lp-release-beat");
    expect(tokens).not.toContain("--support:");
    expect(tokens).not.toContain("--support-bg");
    expect(tokens).not.toContain("--support-ink");
  });

  // Aucune icône d'agrandissement : la vignette est le bouton, sa loupe au survol, l'anneau du survol et celui du focus sont ses repères
  it("has no enlarge icon, and keeps the zoom cursor, the hover ring and the focus ring on the picture", () => {
    expect(css).not.toContain("lp-release-shot-hint");
    expect(css).toMatch(/button\.lp-release-shot \{[^}]*cursor: zoom-in;/);
    expect(css).toMatch(
      /button\.lp-release-shot:focus-visible \{[^}]*outline: 2px solid var\(--focus-ring\);/,
    );
  });

  // Les tailles « display » et « title » restent des jetons : la page n'écrit aucune taille de police
  it("writes no font size of its own for the page: the sizes stay tokens", () => {
    expect(tokens).toContain("--type-display-size: 32px;");
    expect(bodyOf(tokens, ".lp-type-display")).toContain("font-size: var(--type-display-size);");
    expect(bodyOf(css, MEDIUM)).not.toMatch(/font-size: \d/);
  });
});

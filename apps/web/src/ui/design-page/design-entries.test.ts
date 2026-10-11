import { describe, expect, it } from "vitest";
import { DEFAULT_ENTRY_SLUG, DESIGN_CHAPTERS, DESIGN_ENTRIES, toEntry } from "./design-entries";

describe("le sommaire de /design", () => {
  // Une entrée s'ouvre par son slug, qui vit dans l'adresse : deux entrées de même slug se masqueraient.
  it("gives every entry its own slug, in ascii lowercase with dashes", () => {
    const slugs = DESIGN_ENTRIES.map(({ slug }) => slug);
    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter((slug) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))).toEqual([]);
  });

  it("holds the five chapters and the 46 entries of the brief", () => {
    expect(DESIGN_CHAPTERS.map(({ id }) => id)).toEqual([
      "foundations",
      "components",
      "game",
      "window",
      "dialogs",
    ]);
    expect(DESIGN_ENTRIES).toHaveLength(46);
  });

  it("never leaves a chapter empty", () => {
    const empty = DESIGN_CHAPTERS.filter(
      ({ id }) => !DESIGN_ENTRIES.some(({ chapterId }) => chapterId === id),
    );
    expect(DESIGN_CHAPTERS.length).toBeGreaterThan(0);
    expect(empty).toEqual([]);
  });

  it("files every entry under a known chapter", () => {
    const known = new Set<string>(DESIGN_CHAPTERS.map(({ id }) => id));
    expect(DESIGN_ENTRIES.filter(({ chapterId }) => !known.has(chapterId))).toEqual([]);
  });

  // Dans l'écran de jeu, le sommaire dit où vit chaque pill.
  it("gives every game entry the place it has on screen", () => {
    const game = DESIGN_ENTRIES.filter(({ chapterId }) => chapterId === "game");
    expect(game.length).toBeGreaterThan(0);
    expect(game.filter((entry) => !("place" in entry))).toEqual([]);
  });

  it("includes the default entry", () => {
    expect(DESIGN_ENTRIES.some(({ slug }) => slug === DEFAULT_ENTRY_SLUG)).toBe(true);
  });

  // `location.hash` commence par « # » ; le slug seul est accepté aussi.
  it("opens the entry that a known hash names", () => {
    expect(toEntry("#dessin").slug).toBe("dessin");
    expect(toEntry("jauge").slug).toBe("jauge");
    expect(toEntry("#retirer-bannir-signaler").chapterId).toBe("dialogs");
  });

  it("opens the default entry when the hash is empty or unknown", () => {
    expect(toEntry("").slug).toBe(DEFAULT_ENTRY_SLUG);
    expect(toEntry("#").slug).toBe(DEFAULT_ENTRY_SLUG);
    expect(toEntry("#nulle-part").slug).toBe(DEFAULT_ENTRY_SLUG);
  });
});

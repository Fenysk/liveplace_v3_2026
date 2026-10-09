import { describe, expect, it } from "vitest";
import { isInsideClips, placeBubble, positionBubble } from "./bubble-position";

const screen = { width: 375, height: 812 };
const bubble = { width: 200, height: 60 };
const margin = 8;

describe("où poser une bulle qui vise un élément (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Centrée sur la cible, juste au-dessus d'elle, la flèche au milieu de la bulle
  it("centers the bubble on the target, right above it, with the arrow in the middle", () => {
    const target = { left: 150, top: 700, width: 40, height: 40 };

    expect(positionBubble(target, bubble, screen, margin)).toEqual({ left: 70, top: 640, arrowX: 100 });
  });

  // Une cible près du bord droit : la bulle reste dans l'écran, la flèche continue de viser la cible
  it("keeps the bubble inside the screen near the right edge, the arrow still aiming at the target", () => {
    const target = { left: 330, top: 700, width: 40, height: 40 };

    expect(positionBubble(target, bubble, screen, margin)).toEqual({ left: 167, top: 640, arrowX: 183 });
  });

  // Près du bord gauche, de même
  it("keeps the bubble inside the screen near the left edge too", () => {
    const target = { left: 0, top: 700, width: 40, height: 40 };

    expect(positionBubble(target, bubble, screen, margin)).toEqual({ left: 8, top: 640, arrowX: 12 });
  });

  // Une bulle plus large que l'écran reste collée à la marge gauche
  it("sticks to the left margin when wider than the screen", () => {
    const target = { left: 150, top: 700, width: 40, height: 40 };

    expect(positionBubble(target, { width: 400, height: 60 }, screen, margin).left).toBe(8);
  });

  // Une cible tout en haut : la bulle ne sort pas par le haut
  it("stays below the top margin when the target is at the very top", () => {
    const target = { left: 150, top: 20, width: 40, height: 40 };

    expect(positionBubble(target, bubble, screen, margin).top).toBe(8);
  });
});

// La bulle d'aide (JOURNAL 2026-10-08) : 200 × 50 de surface, 12 px de flèche, dans un téléphone puis couché.
const pill = { width: 200, height: 50 };
const arrowSpace = 12;
const landscape = { width: 812, height: 375 };

describe("où poser une bulle d'aide contre la pill de sa cible (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // La cible est dans une pill de plusieurs rangées : la bulle se pose au-dessus de la pill, sans la couvrir, la flèche vers la cible
  it("sits above the whole pill that holds the target, the arrow still aiming at the target", () => {
    const sheet = { left: 15, top: 600, width: 345, height: 200 };
    const target = { left: 250, top: 740, width: 44, height: 44 };

    expect(placeBubble(target, sheet, pill, screen, margin, arrowSpace)).toEqual({
      side: "above",
      left: 167,
      top: 538,
      arrow: 105,
    });
  });

  // Une pill tout en haut n'a pas de place au-dessus : la bulle passe dessous, la flèche vers le haut
  it("goes below a pill at the very top of the screen", () => {
    const pillAtTop = { left: 250, top: 8, width: 117, height: 60 };
    const target = { left: 300, top: 14, width: 36, height: 36 };

    expect(placeBubble(target, pillAtTop, pill, screen, margin, arrowSpace)).toEqual({
      side: "below",
      left: 167,
      top: 68,
      arrow: 151,
    });
  });

  // Une colonne à droite d'un écran couché : ni dessus ni dessous, la bulle se pose à sa gauche, la flèche vers la cible
  it("goes to the left of a tall column on the right of a landscape screen", () => {
    const column = { left: 740, top: 30, width: 60, height: 300 };
    const target = { left: 748, top: 100, width: 44, height: 44 };

    expect(placeBubble(target, column, pill, landscape, margin, arrowSpace)).toEqual({
      side: "left",
      left: 528,
      top: 97,
      arrow: 25,
    });
  });

  // Une colonne à gauche : à sa droite
  it("goes to the right of a tall column on the left", () => {
    const column = { left: 8, top: 30, width: 60, height: 300 };
    const target = { left: 16, top: 100, width: 44, height: 44 };

    expect(placeBubble(target, column, pill, landscape, margin, arrowSpace)).toEqual({
      side: "right",
      left: 68,
      top: 97,
      arrow: 25,
    });
  });

  // Une cible au bord de la colonne : la bulle reste dans l'écran, la flèche continue de viser la cible
  it("keeps a side bubble inside the screen, the arrow still aiming at the target", () => {
    const column = { left: 740, top: 30, width: 60, height: 300 };
    const target = { left: 748, top: 328, width: 44, height: 44 };

    expect(placeBubble(target, column, pill, landscape, margin, arrowSpace)).toEqual({
      side: "left",
      left: 528,
      top: 317,
      arrow: 33,
    });
  });

  // Aucun côté ne tient : celui qui déborde le moins, dessus d'abord à égalité
  it("takes the side that overflows the least when none fits", () => {
    const tiny = { width: 100, height: 100 };
    const anchor = { left: 10, top: 40, width: 40, height: 20 };

    expect(placeBubble(anchor, anchor, pill, tiny, margin, arrowSpace).side).toBe("above");
    expect(placeBubble(anchor, { ...anchor, top: 50 }, pill, tiny, margin, arrowSpace).side).toBe("above");
    expect(placeBubble(anchor, { ...anchor, top: 20 }, pill, tiny, margin, arrowSpace).side).toBe("below");
  });
});

// Dans une fenêtre (Écart §8.1, JOURNAL 2026-10-09) : la bulle se pose contre l'élément lui-même, sur les côtés qu'on lui laisse.
describe("où poser une bulle contre un onglet de la fenêtre (Écart §8.1, JOURNAL 2026-10-09)", () => {
  const desktop = { width: 1440, height: 900 };

  // Un onglet au bord gauche de la fenêtre, avec de la place avant elle : à sa gauche, la flèche vers lui
  it("goes to the left of a tab at the left edge of the window when there is room, the arrow aiming at it", () => {
    const tab = { left: 348, top: 274, width: 192, height: 36 };

    expect(placeBubble(tab, tab, pill, desktop, margin, arrowSpace, ["left", "right"])).toEqual({
      side: "left",
      left: 136,
      top: 267,
      arrow: 25,
    });
  });

  // Sans place à gauche (une fenêtre presque aussi large que l'écran) : à sa droite, par-dessus le contenu
  it("goes to the right of the tab, over the content, when the screen leaves no room on the left", () => {
    const tab = { left: 50, top: 100, width: 192, height: 36 };

    expect(placeBubble(tab, tab, pill, landscape, margin, arrowSpace, ["left", "right"])).toEqual({
      side: "right",
      left: 242,
      top: 93,
      arrow: 25,
    });
  });

  // Une rangée d'onglets : dessous d'abord, la flèche vers le haut ; dessus si dessous n'a pas de place
  it("goes below a tab in a row, or above it when the screen ends under it", () => {
    const tab = { left: 190, top: 200, width: 100, height: 44 };
    const lowTab = { ...tab, top: 760 };

    expect(placeBubble(tab, tab, pill, screen, margin, arrowSpace, ["below", "above"]).side).toBe("below");
    expect(placeBubble(lowTab, lowTab, pill, screen, margin, arrowSpace, ["below", "above"]).side).toBe(
      "above",
    );
  });

  // Les côtés laissés sont les seuls essayés : aucun ne tient, celui qui déborde le moins parmi eux, jamais un côté interdit
  it("never takes a side it was not given, even when none of the given ones fits", () => {
    const tab = { left: 10, top: 40, width: 40, height: 20 };
    const tiny = { width: 100, height: 100 };

    expect(placeBubble(tab, tab, pill, tiny, margin, arrowSpace, ["left", "right"]).side).toBe("right");
  });
});

describe("la cible est-elle à la vue dans la fenêtre qui défile (Écart §8.1, JOURNAL 2026-10-09)", () => {
  const body = { left: 548, top: 260, width: 550, height: 300 };
  const field = { left: 564, top: 283, width: 520, height: 36 };

  // Le centre de la cible dans chaque cadre qui la rogne : la bulle reste
  it("keeps the bubble while the center of the target is inside every clipping frame", () => {
    expect(isInsideClips(field, [body])).toBe(true);
    expect(isInsideClips(field, [])).toBe(true);
  });

  // Le corps a défilé : la cible est passée sous son bord haut, la bulle s'efface avec elle
  it("hides the bubble once the body scrolled the target out of its frame", () => {
    expect(isInsideClips({ ...field, top: 230 }, [body])).toBe(false);
    expect(isInsideClips({ ...field, top: 580 }, [body])).toBe(false);
  });

  // Dans plusieurs cadres (le corps, puis la fenêtre) : sortir de l'un suffit
  it("hides the bubble when the target leaves any one of several frames", () => {
    const window = { left: 340, top: 190, width: 760, height: 520 };

    expect(isInsideClips(field, [body, window])).toBe(true);
    expect(isInsideClips(field, [body, { ...window, left: 900 }])).toBe(false);
  });
});

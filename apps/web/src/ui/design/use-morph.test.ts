import { describe, expect, it } from "vitest";
import { MORPHING_SELECTOR } from "./morphing";
import { createMorph, type Motion } from "./use-morph";

const MOTION: Motion = { duration: 340, fadeDuration: 140, easing: "ease" };
const HEIGHT = 104;
const FRAMES_PER_GLIDE = 20;
const FRAMES = 30;

type Glide = { from: number; to: number; progress: number; isDone: boolean; finish: () => void };

const widthOf = (keyframe: Keyframe | undefined): number => Number.parseFloat(String(keyframe?.width));
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type BarOptions = { followsPill: boolean; motion?: Motion; hasMorphingChild?: boolean };

// Une barre dont l'écran tourne, comme le navigateur la mesure : la pill est large comme son emplacement (`layoutWidth`), le contenu
// comme la pill (`width: 100%`) ou comme lui-même (`max-content`). Une animation de la pill fixe sa largeur. `frame` avance le temps
// d'une image puis rend la main au ResizeObserver, qui rappelle une fois par image, si la taille du contenu a changé.
const createBar = ({ followsPill, motion = MOTION, hasMorphingChild = false }: BarOptions) => {
  const glides: Glide[] = [];
  const style = { width: "" };
  let layoutWidth = 374;
  let observedWidth = layoutWidth;

  const pillWidth = (): number => {
    const glide = glides.filter((candidate) => !candidate.isDone).at(-1);
    return glide ? Math.round(glide.from + (glide.to - glide.from) * glide.progress) : layoutWidth;
  };
  const contentWidth = (): number => {
    if (style.width) return Number.parseFloat(style.width);
    return followsPill ? pillWidth() : layoutWidth;
  };

  const pill = {
    animate: (keyframes: Keyframe[]) => {
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const glide: Glide = {
        from: widthOf(keyframes[0]),
        to: widthOf(keyframes[1]),
        progress: 0,
        isDone: false,
        finish: () => {
          glide.isDone = true;
          finish();
        },
      };
      glides.push(glide);
      return { finished };
    },
  };
  const content = {
    get offsetWidth() {
      return contentWidth();
    },
    offsetHeight: HEIGHT,
    style,
    querySelector: (selector: string) => (hasMorphingChild && selector === MORPHING_SELECTOR ? {} : null),
    animate: () => undefined,
  };
  const onResize = createMorph(pill, content, () => motion);

  const observe = () => {
    if (contentWidth() === observedWidth) return;
    observedWidth = contentWidth();
    onResize();
  };
  return {
    glides,
    content,
    // L'écran tourne : l'emplacement change de largeur, et le ResizeObserver le voit
    resizeLayout: (width: number) => {
      layoutWidth = width;
      observe();
    },
    frame: async () => {
      for (const glide of glides)
        if (!glide.isDone) {
          glide.progress = Math.min(1, glide.progress + 1 / FRAMES_PER_GLIDE);
          if (glide.progress === 1) glide.finish();
        }
      await flush();
      observe();
    },
  };
};

describe("le morphing quand la disposition change (le défaut de la rotation, ee36300)", () => {
  // Une barre pleine largeur passe de 374 à 320 px (portrait → colonne du paysage) : son contenu, large comme la pill, ne doit pas
  // suivre l'animation de la pill, sinon chaque image en relance une, la largeur reste coincée au milieu et le fondu repart à zéro
  it("glides once from the old width to the new when the content is as wide as the pill", async () => {
    const bar = createBar({ followsPill: true });
    bar.resizeLayout(320);
    for (let image = 0; image < FRAMES; image += 1) await bar.frame();
    expect(bar.glides).toHaveLength(1);
    expect(bar.glides[0]).toMatchObject({ from: 374, to: 320 });
    expect(bar.content.offsetWidth).toBe(320);
  });

  // Tant qu'elle glisse, la pill est plus large que sa place, mais le contenu garde sa largeur d'arrivée
  it("keeps the content at its final width while the pill glides", async () => {
    const bar = createBar({ followsPill: true });
    bar.resizeLayout(320);
    for (let image = 0; image < FRAMES_PER_GLIDE - 1; image += 1) {
      await bar.frame();
      expect(bar.content.offsetWidth).toBe(320);
    }
  });

  // Le glissement fini, la largeur imposée au contenu est rendue : le contenu retrouve celle de sa pill
  it("gives the width back to the content once the glide is over", async () => {
    const bar = createBar({ followsPill: true });
    bar.resizeLayout(320);
    for (let image = 0; image < FRAMES; image += 1) await bar.frame();
    expect(bar.content.style.width).toBe("");
    bar.resizeLayout(400);
    expect(bar.glides).toHaveLength(2);
    expect(bar.glides[1]).toMatchObject({ from: 320, to: 400 });
  });

  // Un contenu qui a sa propre largeur ne dépend pas de la pill : rien à lui imposer, il garde le droit de grandir en chemin
  it("leaves a content with its own width alone", async () => {
    const bar = createBar({ followsPill: false });
    bar.resizeLayout(260);
    for (let image = 0; image < FRAMES; image += 1) {
      await bar.frame();
      expect(bar.content.style.width).toBe("");
    }
    expect(bar.glides).toHaveLength(1);
  });

  // Sans mouvement (prefers-reduced-motion), rien ne glisse et rien n'est imposé au contenu
  it("does nothing without motion", async () => {
    const bar = createBar({ followsPill: true, motion: { ...MOTION, duration: 0 } });
    bar.resizeLayout(320);
    await bar.frame();
    expect(bar.glides).toHaveLength(0);
    expect(bar.content.style.width).toBe("");
  });

  // Un élément qui glisse déjà dans le contenu fait suivre la pill : elle ne rejoue rien
  it("does not replay the pill while an element of its content glides", async () => {
    const bar = createBar({ followsPill: true, hasMorphingChild: true });
    bar.resizeLayout(320);
    await bar.frame();
    expect(bar.glides).toHaveLength(0);
  });
});

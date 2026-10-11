import { describe, expect, it } from "vitest";
import {
  type HeightAnimation,
  morphSection,
  SECTION_MORPH_ID,
  type SectionMotion,
} from "./use-section-morph";

const MOTION: SectionMotion = { duration: 340, fadeDuration: 140, easing: "ease" };
const NO_MOTION: SectionMotion = { duration: 0, fadeDuration: 0, easing: "ease" };

type Call = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };
type FakeAnimation = HeightAnimation & { height: number; wasCancelled: boolean };

// Une fenêtre comme le navigateur la mesure : sa hauteur est celle du contenu, sauf pendant un glissement, où elle est celle de l'animation.
const createWindow = (naturalHeight: number) => {
  const glides: Call[] = [];
  const fades: Call[] = [];
  const animations: FakeAnimation[] = [];
  const dialog = {
    get offsetHeight(): number {
      return animations.find(({ playState }) => playState === "running")?.height ?? naturalHeight;
    },
    animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions): FakeAnimation => {
      glides.push({ keyframes, options });
      const animation: FakeAnimation = {
        playState: "running",
        height: Number.parseFloat(String(keyframes[0]?.height)),
        wasCancelled: false,
        finished: new Promise(() => undefined),
        cancel: () => {
          animation.playState = "idle";
          animation.wasCancelled = true;
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  const content = {
    animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      fades.push({ keyframes, options });
    },
  };
  // Une glissade déjà partie, à `height` px
  const startGlide = (height: number): FakeAnimation => {
    const animation = dialog.animate([{ height: `${height}px` }, { height: "500px" }], {});
    glides.length = 0;
    return animation;
  };
  return { dialog, content, glides, fades, startGlide };
};

const FADE: Call = {
  keyframes: [{ opacity: 0 }, { opacity: 1 }],
  options: { duration: 140, easing: "ease" },
};

describe("morphSection : la hauteur de la fenêtre glisse quand la section change", () => {
  // Quand la section est plus haute, la fenêtre grandit de l'ancienne hauteur à la nouvelle, et le contenu arrive en fondu
  it("glides from the previous height to the new one and fades the content in", () => {
    const shown = createWindow(420);
    morphSection(shown.dialog, shown.content, undefined, 300, MOTION);
    expect(shown.glides).toEqual([
      {
        keyframes: [{ height: "300px" }, { height: "420px" }],
        options: { duration: 340, easing: "ease", id: SECTION_MORPH_ID },
      },
    ]);
    expect(shown.fades).toEqual([FADE]);
  });

  // Quand elle est plus basse, la fenêtre rétrécit
  it("shrinks when the new section is shorter", () => {
    const shown = createWindow(260);
    morphSection(shown.dialog, shown.content, undefined, 400, MOTION);
    expect(shown.glides[0]?.keyframes).toEqual([{ height: "400px" }, { height: "260px" }]);
  });

  // À sa hauteur maximale (ou à hauteur fixe sur PC), rien ne saute : seul le contenu passe en fondu
  it("only fades the content in when the height stays the same", () => {
    const shown = createWindow(520);
    expect(morphSection(shown.dialog, shown.content, undefined, 520, MOTION)).toBeUndefined();
    expect(shown.glides).toEqual([]);
    expect(shown.fades).toEqual([FADE]);
  });

  // Fermée, la fenêtre n'a pas de hauteur : le changement de section ne se voit pas, il ne s'anime pas
  it("does not animate a window that is closed", () => {
    const before = createWindow(420);
    morphSection(before.dialog, before.content, undefined, 0, MOTION);
    const after = createWindow(0);
    morphSection(after.dialog, after.content, undefined, 300, MOTION);
    expect([before.glides, before.fades, after.glides, after.fades]).toEqual([[], [], [], []]);
  });

  // Sans mouvement (prefers-reduced-motion), tout passe d'un coup
  it("does not animate when the motion is off", () => {
    const shown = createWindow(420);
    morphSection(shown.dialog, shown.content, undefined, 300, NO_MOTION);
    expect([shown.glides, shown.fades]).toEqual([[], []]);
  });

  // Un second choix en plein glissement : la fenêtre repart de la hauteur où elle est, pas de celle qu'elle quittait
  it("starts from the height the window has reached when a glide is still running", () => {
    const shown = createWindow(380);
    const running = shown.startGlide(350);
    morphSection(shown.dialog, shown.content, running, 300, MOTION);
    expect(shown.glides[0]?.keyframes).toEqual([{ height: "350px" }, { height: "380px" }]);
    expect(running.wasCancelled).toBe(true);
  });

  // La hauteur mesurée est celle du contenu, pas celle de l'ancien glissement : il est coupé avant la mesure
  it("measures the natural height after cutting the running glide", () => {
    const shown = createWindow(380);
    const running = shown.startGlide(350);
    const next = morphSection(shown.dialog, shown.content, running, 300, MOTION);
    expect(next).toBeDefined();
    expect(shown.glides[0]?.keyframes[1]).toEqual({ height: "380px" });
  });

  // Le glissement coupé n'est pas remplacé quand la fenêtre est déjà à la bonne hauteur
  it("gives no new glide when the running one already reached the new height", () => {
    const shown = createWindow(350);
    const running = shown.startGlide(350);
    expect(morphSection(shown.dialog, shown.content, running, 300, MOTION)).toBeUndefined();
    expect(running.wasCancelled).toBe(true);
  });
});

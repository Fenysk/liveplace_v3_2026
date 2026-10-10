import { describe, expect, it } from "vitest";
import {
  type GlideAnimation,
  type GlideOptions,
  type SelectionElement,
  type SelectionGlideMotion,
  slideSelection,
} from "./use-selection-glide";

const MOTION = () => ({ duration: 340, easing: "ease" }) satisfies SelectionGlideMotion;
const ROOT = { name: "root" };

type Call = { keyframes: Keyframe[]; options: GlideOptions };
type Option = SelectionElement & { calls: Call[]; glide: FakeGlide | undefined };
type FakeGlide = GlideAnimation & { wasCancelled: boolean };

// Un glissement en cours est à `progress` de son trajet ; `cancel` le coupe.
const createGlide = (progress: number): FakeGlide => {
  const glide: FakeGlide = {
    playState: "running",
    wasCancelled: false,
    effect: { getComputedTiming: () => ({ progress }) },
    cancel: () => {
      glide.wasCancelled = true;
    },
  };
  return glide;
};

type Place = { x: number; y: number; width: number; height: number };

// Une option comme le navigateur la mesure : sa place dans son parent positionné, sans les transformations.
const createOption = ({ x, y, width, height }: Place, parent: unknown = ROOT, progress = 0): Option => {
  const option: Option = {
    offsetLeft: x,
    offsetTop: y,
    offsetWidth: width,
    offsetHeight: height,
    offsetParent: parent,
    isConnected: true,
    calls: [],
    glide: undefined,
    animate: (keyframes, options) => {
      option.calls.push({ keyframes, options });
      option.glide = createGlide(progress);
      return option.glide;
    },
  };
  return option;
};

const FIRST = { x: 3, y: 3, width: 60, height: 30 };
const SECOND = { x: 65, y: 3, width: 80, height: 30 };
const THIRD = { x: 147, y: 3, width: 50, height: 30 };

describe("slideSelection : le fond de l'option choisie glisse de l'ancienne à la nouvelle", () => {
  // Quand une autre option est choisie, son fond part de la boîte de l'ancienne : il se décale d'autant, et s'étire de l'écart de taille
  it("starts the new background on the box of the previous option", () => {
    const first = createOption(FIRST);
    const second = createOption(SECOND);
    slideSelection(ROOT, second, { element: first }, MOTION);
    expect(second.calls).toEqual([
      {
        keyframes: [
          { transform: "translate(-62px, 0px)", right: "20px", bottom: "0px" },
          { transform: "translate(0px, 0px)", right: "0px", bottom: "0px" },
        ],
        options: { duration: 340, easing: "ease", pseudoElement: "::before" },
      },
    ]);
  });

  // Une option plus étroite que la précédente : le fond se rétrécit en arrivant
  it("shrinks the background when the new option is narrower", () => {
    const second = createOption(SECOND);
    const third = createOption(THIRD);
    slideSelection(ROOT, third, { element: second }, MOTION);
    expect(third.calls[0]?.keyframes[0]).toEqual({
      transform: "translate(-82px, 0px)",
      right: "-30px",
      bottom: "0px",
    });
  });

  // Une option dans une liste verticale : le fond monte ou descend
  it("slides along the column of a vertical list", () => {
    const upper = createOption({ x: 8, y: 8, width: 192, height: 36 });
    const lower = createOption({ x: 8, y: 46, width: 192, height: 36 });
    slideSelection(ROOT, upper, { element: lower }, MOTION);
    expect(upper.calls[0]?.keyframes[0]).toEqual({
      transform: "translate(0px, 38px)",
      right: "0px",
      bottom: "0px",
    });
  });

  // La boîte compte depuis le conteneur : un parent positionné entre l'option et lui s'additionne
  it("measures the box from the container through the positioned parents", () => {
    const positionedParent = createOption({ x: 100, y: 0, width: 80, height: 30 });
    const inside = createOption({ x: 5, y: 2, width: 60, height: 30 }, positionedParent);
    const first = createOption(FIRST);
    slideSelection(ROOT, inside, { element: first }, MOTION);
    expect(inside.calls[0]?.keyframes[0]).toMatchObject({ transform: "translate(-102px, 1px)" });
  });

  // Au premier affichage, le fond est déjà en place : il ne glisse pas
  it("does not glide the first time a selection is shown", () => {
    const first = createOption(FIRST);
    const seen = slideSelection(ROOT, first, undefined, MOTION);
    expect(first.calls).toEqual([]);
    expect(seen?.element).toBe(first);
  });

  // Rien ne change quand l'option choisie reste la même (un rendu de plus)
  it("does nothing while the selection stays on the same option", () => {
    const first = createOption(FIRST);
    const seen = { element: first };
    expect(slideSelection(ROOT, first, seen, MOTION)).toBe(seen);
    expect(first.calls).toEqual([]);
  });

  // Un rendu de plus en plein glissement ne le relance pas
  it("lets a running glide go on when the same option is still selected", () => {
    const second = createOption(SECOND);
    const running = createGlide(0.5);
    const seen = { element: second, glide: { animation: running, from: FIRST, to: SECOND } };
    expect(slideSelection(ROOT, second, seen, MOTION)).toBe(seen);
    expect(running.wasCancelled).toBe(false);
  });

  // Sans mouvement (prefers-reduced-motion), le fond passe d'un coup
  it("does not glide when the motion is off", () => {
    const first = createOption(FIRST);
    const second = createOption(SECOND);
    slideSelection(ROOT, second, { element: first }, () => ({ duration: 0, easing: "ease" }));
    expect(second.calls).toEqual([]);
  });

  // L'ancienne option n'est plus dans la page (un chapitre replié) : le fond apparaît sur la nouvelle
  it("does not glide from an option that left the page", () => {
    const first = createOption(FIRST);
    first.isConnected = false;
    const second = createOption(SECOND);
    slideSelection(ROOT, second, { element: first }, MOTION);
    expect(second.calls).toEqual([]);
  });

  // Plus aucune option choisie : le glissement en cours s'arrête
  it("stops the running glide when nothing is selected any more", () => {
    const first = createOption(FIRST);
    const running = createGlide(0.3);
    expect(
      slideSelection(
        ROOT,
        null,
        { element: first, glide: { animation: running, from: FIRST, to: SECOND } },
        MOTION,
      ),
    ).toBeUndefined();
    expect(running.wasCancelled).toBe(true);
  });

  // Un second choix en plein glissement : le fond repart d'où il est, pas de l'option qu'il quittait
  it("starts from where the background is when a glide is still running", () => {
    const second = createOption(SECOND);
    const third = createOption(THIRD);
    const running = createGlide(0.5);
    slideSelection(
      ROOT,
      third,
      { element: second, glide: { animation: running, from: FIRST, to: SECOND } },
      MOTION,
    );
    // À mi-chemin de la première à la deuxième : x = 34, largeur = 70
    expect(third.calls[0]?.keyframes[0]).toEqual({
      transform: "translate(-113px, 0px)",
      right: "-20px",
      bottom: "0px",
    });
    expect(running.wasCancelled).toBe(true);
  });

  // Un glissement fini ne compte plus : le suivant part de l'option choisie
  it("starts from the previous option once its glide is over", () => {
    const second = createOption(SECOND);
    const third = createOption(THIRD);
    const finished = { ...createGlide(1), playState: "finished" };
    slideSelection(
      ROOT,
      third,
      { element: second, glide: { animation: finished, from: FIRST, to: SECOND } },
      MOTION,
    );
    expect(third.calls[0]?.keyframes[0]).toMatchObject({ transform: "translate(-82px, 0px)" });
  });
});

import { describe, expect, it } from "vitest";
import {
  CHOICES,
  FORMAT_LOOP_MS,
  FORMAT_RESTING_MS,
  FRAME_SIZES,
  formatAt,
  OPTION_SPOTS,
  START_FORMAT,
} from "./format-motion";

describe("Le format de la fresque (vignette)", () => {
  // L'image fixe : 16:9 choisi, le cadre à sa forme, rien d'enfoncé
  it("rests on 16:9 chosen, the frame at its shape", () => {
    const moment = formatAt(FORMAT_RESTING_MS);

    expect(moment.chosen).toBe("16:9");
    expect(moment.frame).toEqual(FRAME_SIZES["16:9"]);
    expect(Object.values(moment.taps)).toEqual([0, 0, 0]);
  });

  // La souris choisit 1:1, puis 16:9, puis 9:16, dans cet ordre
  it("chooses 1:1, then 16:9, then 9:16, in that order", () => {
    expect(CHOICES.map(({ format }) => format)).toEqual(["1:1", "16:9", "9:16"]);
    expect(formatAt(1500).chosen).toBe(START_FORMAT);
    expect(formatAt(1800).chosen).toBe("1:1");
    expect(formatAt(3500).chosen).toBe("16:9");
    expect(formatAt(5300).chosen).toBe("9:16");
  });

  // La pointe tombe sur l'option au clic, qui s'enfonce, et la souris s'enfonce avec elle
  it("puts the tip on each option at its click, which presses it", () => {
    for (const { format, clickMs } of CHOICES) {
      const moment = formatAt(clickMs);

      expect([moment.pointer.ax, moment.pointer.ay, moment.pointer.bx, moment.pointer.by]).toEqual([
        OPTION_SPOTS[format].ax,
        OPTION_SPOTS[format].ay,
        OPTION_SPOTS[format].bx,
        OPTION_SPOTS[format].by,
      ]);
      expect(moment.taps[format]).toBe(1);
      expect(moment.press).toBe(1);
    }
  });

  // Le cadre glisse vers la forme du format choisi : de l'ancienne forme, en passant par des formes entre les deux, jusqu'à la nouvelle
  it("glides the frame from the old shape to the shape of the chosen format", () => {
    expect(formatAt(1500).frame).toEqual(FRAME_SIZES["9:16"]);
    const between = formatAt(1600 + 80 + 100).frame;
    expect(between.width).toBeGreaterThan(FRAME_SIZES["9:16"].width);
    expect(between.width).toBeLessThan(FRAME_SIZES["1:1"].width);
    expect(formatAt(2300).frame).toEqual(FRAME_SIZES["1:1"]);
    expect(formatAt(4100).frame).toEqual(FRAME_SIZES["16:9"]);
    expect(formatAt(6000).frame).toEqual(FRAME_SIZES["9:16"]);
  });

  // Chaque cadre a les proportions de son format
  it("gives each frame the proportions of its format", () => {
    expect(FRAME_SIZES["1:1"].width / FRAME_SIZES["1:1"].height).toBe(1);
    expect(FRAME_SIZES["16:9"].width / FRAME_SIZES["16:9"].height).toBeCloseTo(16 / 9, 5);
    expect(FRAME_SIZES["9:16"].width / FRAME_SIZES["9:16"].height).toBeCloseTo(9 / 16, 5);
  });

  // La boucle se referme sans saut : elle finit sur le format où elle commence, la souris part en fondu
  it("closes the loop without a jump, the mouse fading out", () => {
    expect(START_FORMAT).toBe("9:16");
    expect(formatAt(7000).frame).toEqual(formatAt(0).frame);
    expect(formatAt(0).pointer.opacity).toBe(0);
    expect(formatAt(7550).pointer.opacity).toBeGreaterThan(0);
    expect(formatAt(7550).pointer.opacity).toBeLessThan(1);
    expect(formatAt(FORMAT_LOOP_MS + 3500)).toEqual(formatAt(3500));
  });
});

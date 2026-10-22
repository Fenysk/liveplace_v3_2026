import { describe, expect, it } from "vitest";
import {
  type Box,
  FLIGHT_EASING,
  FLIGHT_LIFT_PX,
  FLIGHT_MS,
  FLIGHT_STAGGER_MS,
  flightDelayMs,
  flightKeyframes,
  WAVE_MS,
  waveKeyframes,
} from "./home-flight";

const phoneCell: Box = { x: 40, y: 300, width: 11, height: 11 };
const streamCell: Box = { x: 360, y: 120, width: 8, height: 8 };

const transformOf = (frame: Keyframe | undefined): string => String(frame?.transform ?? "");

describe("the flight of a pixel", () => {
  // Quand le visiteur touche « Dessiner · n », chaque case s'envole en 0,5 s, décalée de 70 ms
  it("lasts half a second per pixel, each one 70 ms after the one before", () => {
    expect(FLIGHT_MS).toBe(500);
    expect(FLIGHT_STAGGER_MS).toBe(70);
    expect([0, 1, 2, 9].map(flightDelayMs)).toEqual([0, 70, 140, 630]);
    expect(FLIGHT_EASING).toBe("ease-in-out");
  });

  // Il part de sa case sur le téléphone, à sa taille, et arrive sur SA case exacte du stream, à la taille de celle-ci
  it("leaves its cell on the phone at its size and lands on its exact cell of the stream at that size", () => {
    const [start, , end] = flightKeyframes(phoneCell, streamCell);

    expect(transformOf(start)).toBe("translate(40px, 300px) scale(11)");
    expect(transformOf(end)).toBe("translate(360px, 120px) scale(8)");
  });

  // Entre les deux, il passe par le point milieu, relevé de 40 px et agrandi : le vol est un arc, pas une droite
  it("passes by the middle point, lifted by 40 px and enlarged", () => {
    const frames = flightKeyframes(phoneCell, streamCell);
    const middle = frames[1];
    // Le point milieu des centres, relevé au-dessus du plus haut des deux centres
    const centre = { x: (45.5 + 364) / 2, y: Math.min(305.5, 124) - FLIGHT_LIFT_PX };
    const size = 11 * 1.5;

    expect(frames).toHaveLength(3);
    expect(middle?.offset).toBe(0.5);
    expect(transformOf(middle)).toBe(
      `translate(${centre.x - size / 2}px, ${centre.y - size / 2}px) scale(${size})`,
    );
    expect(FLIGHT_LIFT_PX).toBe(40);
  });

  // Un pixel qui grandit en route (une case de stream plus grande que celle du téléphone) agrandit aussi son milieu
  it("enlarges the middle from the larger of the two cells", () => {
    const frames = flightKeyframes(
      { ...phoneCell, width: 6, height: 6 },
      { ...streamCell, width: 20, height: 20 },
    );

    expect(transformOf(frames[1])).toContain("scale(30)");
  });
});

describe("the wave of the finger", () => {
  // L'onde du doigt grandit en s'effaçant, centrée sur ce qu'il touche
  it("grows while it fades, around the point that is touched", () => {
    const [start, end] = waveKeyframes({ x: 100, y: 50 });

    expect(WAVE_MS).toBeGreaterThan(0);
    expect(transformOf(start)).toBe("translate(100px, 50px) scale(0.5)");
    expect(start?.opacity).toBe(1);
    expect(transformOf(end)).toBe("translate(100px, 50px) scale(1.3)");
    expect(end?.opacity).toBe(0);
  });
});

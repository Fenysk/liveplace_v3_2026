import { describe, expect, it } from "vitest";
import { loopTime } from "./motion-math";
import { delayedTime, THUMBNAIL_STAGGER_MS, thumbnailDelayMs } from "./thumbnail-delay";
import { growthAt, LOOP_MS } from "./thumbnail-motion";

describe("le décalage des vignettes", () => {
  // Le décalage entre deux vignettes voisines est de 300 ms, à un seul endroit
  it("staggers neighbouring thumbnails by 300 ms", () => {
    expect(THUMBNAIL_STAGGER_MS).toBe(300);
  });

  // La première part à 0, la deuxième 300 ms plus tard, la troisième à 600 ms : le retard est le rang × 300 ms
  it("delays the thumbnail of order n by n × 300 ms, the first one not at all", () => {
    expect([0, 1, 2, 3, 17].map(thumbnailDelayMs)).toEqual([0, 300, 600, 900, 5100]);
  });

  // À un même instant, la vignette retardée montre ce que la précédente montrait 300 ms plus tôt
  it("shows at a time what the thumbnail before it showed 300 ms earlier", () => {
    const now = 5000;

    expect(delayedTime(now, thumbnailDelayMs(0))).toBe(now);
    expect(growthAt(delayedTime(now, thumbnailDelayMs(1)))).toEqual(growthAt(now - 300));
    expect(growthAt(delayedTime(now, thumbnailDelayMs(2)))).toEqual(growthAt(now - 600));
  });

  // Trois vignettes voisines, au même instant, sont dans trois phases différentes
  it("puts three neighbouring thumbnails in three different phases at the same time", () => {
    const now = 2000;
    const phases = [0, 1, 2].map((order) => loopTime(delayedTime(now, thumbnailDelayMs(order)), LOOP_MS));
    const moments = [0, 1, 2].map((order) =>
      JSON.stringify(growthAt(delayedTime(now, thumbnailDelayMs(order)))),
    );

    expect(new Set(phases).size).toBe(3);
    expect(new Set(moments).size).toBe(3);
  });

  // Avant son départ, la vignette retardée a un temps négatif : la boucle le ramène à sa fin, elle ne casse pas
  it("keeps a thumbnail that has not started yet inside its loop", () => {
    const early = delayedTime(100, thumbnailDelayMs(2));

    expect(early).toBe(-500);
    expect(loopTime(early, LOOP_MS)).toBe(LOOP_MS - 500);
    expect(growthAt(early)).toEqual(growthAt(LOOP_MS - 500));
  });
});

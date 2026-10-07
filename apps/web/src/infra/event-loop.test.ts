import { describe, expect, it } from "vitest";
import { createEventLoopMeter } from "./event-loop";

// Écart §9 (JOURNAL 2026-10-07) : l'occupation du web, la part du temps où sa boucle d'événements travaille.
describe("createEventLoopMeter (JOURNAL 2026-10-07)", () => {
  // Dit l'occupation depuis la lecture précédente, entre 0 et 100 % : un travail la monte, une pause la fait retomber
  it("tells how busy the loop has been since the previous reading, from 0 to 100 %: work raises it, a pause lowers it", async () => {
    const meter = createEventLoopMeter();
    meter();

    for (const end = Date.now() + 50; Date.now() < end; ) Math.sqrt(Date.now());
    const busy = meter();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const idle = meter();

    expect(busy).toBeGreaterThan(idle);
    expect(busy).toBeLessThanOrEqual(100);
    expect(idle).toBeGreaterThanOrEqual(0);
  });
});

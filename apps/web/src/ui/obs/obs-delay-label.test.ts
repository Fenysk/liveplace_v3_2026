import { OBS_DELAY_STEPS_MS } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { obsDelayLabel } from "./obs-delay-label";

describe("obsDelayLabel (JOURNAL 2026-09-25)", () => {
  // Nomme chaque cran du délai comme on le dit : aucun, en secondes, puis en minutes
  it("names every delay step the way one says it: none, in seconds, then in minutes", () => {
    expect(OBS_DELAY_STEPS_MS.map(obsDelayLabel)).toEqual([
      "Aucun",
      "5 s",
      "10 s",
      "20 s",
      "30 s",
      "1 min",
      "2 min",
      "5 min",
      "10 min",
    ]);
  });
});

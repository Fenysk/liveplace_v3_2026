import { describe, expect, it } from "vitest";
import { grabberGesture } from "./grabber-gesture";

describe("grabberGesture (design system, poignée de feuille)", () => {
  // Glisser de plus de 24 px vers le haut déplie, vers le bas replie
  it("reads a drag of more than 24 px as up or down", () => {
    expect(grabberGesture(-30)).toBe("up");
    expect(grabberGesture(40)).toBe("down");
  });

  // En deçà, c'est un toucher : la feuille bascule
  it("reads anything shorter as a tap", () => {
    expect(grabberGesture(0)).toBe("tap");
    expect(grabberGesture(-24)).toBe("tap");
    expect(grabberGesture(24)).toBe("tap");
  });
});

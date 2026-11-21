import { describe, expect, it } from "vitest";
import { grabberActivation, grabberGesture } from "./grabber-gesture";

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

describe("grabberActivation (Entrée ou Espace sur la poignée)", () => {
  const onTap = () => undefined;
  const onActivate = () => undefined;

  // Au clavier (`detail` à 0), l'action propre à l'activation passe avant le toucher
  it("picks the activation action at the keyboard when there is one", () => {
    expect(grabberActivation(0, onTap, onActivate)).toBe(onActivate);
  });

  // Sans action d'activation, le clavier fait ce que fait le toucher
  it("falls back to the tap action at the keyboard without one", () => {
    expect(grabberActivation(0, onTap, undefined)).toBe(onTap);
  });

  // Un clic de souris ou de doigt (`detail` au-dessus de 0) ne passe pas par là : le geste du pointeur s'en charge
  it("does nothing for a pointer click", () => {
    expect(grabberActivation(1, onTap, onActivate)).toBeUndefined();
    expect(grabberActivation(2, onTap, undefined)).toBeUndefined();
  });
});

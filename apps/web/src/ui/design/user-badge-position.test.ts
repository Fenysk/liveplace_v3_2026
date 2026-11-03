import { describe, expect, it } from "vitest";
import { placeTip } from "./user-badge-position";

const screen = { width: 375 };
const tip = { width: 120, height: 24 };

describe("placeTip (JOURNAL 2026-11-03)", () => {
  // Quand il y a de la place, l'infobulle se centre au-dessus du badge, à 4 px de lui
  it("centres the tip above the badge", () => {
    const anchor = { left: 180, top: 100, width: 26, height: 26 };
    expect(placeTip(anchor, tip, screen, 4)).toEqual({ left: 133, top: 72 });
  });

  // Un badge au bord gauche ou droit de l'écran : l'infobulle reste entière dans l'écran
  it("keeps the tip inside the screen on both sides", () => {
    expect(placeTip({ left: 0, top: 100, width: 26, height: 26 }, tip, screen, 4).left).toBe(4);
    expect(placeTip({ left: 360, top: 100, width: 26, height: 26 }, tip, screen, 4).left).toBe(251);
  });

  // Un badge tout en haut de l'écran : l'infobulle passe dessous, et jamais coupée en haut
  it("puts the tip under the badge when the top of the screen has no room", () => {
    expect(placeTip({ left: 180, top: 10, width: 26, height: 26 }, tip, screen, 4).top).toBe(40);
  });
});

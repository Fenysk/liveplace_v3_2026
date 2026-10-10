import { describe, expect, it } from "vitest";
import {
  avatarSize,
  fitName,
  initialSize,
  invitationSize,
  nameGap,
  nameSize,
  previewGeometry,
} from "./preview-geometry";

describe("la géométrie de l'image d'aperçu", () => {
  // Quand le canvas est carré, le système doit le poser à gauche sur toute la hauteur utile, le panneau à sa droite
  it("puts a square canvas on the left over the whole useful height, the panel on its right", () => {
    const { canvas, panel, inner, content } = previewGeometry(50, 50);

    expect(canvas).toEqual({ left: 48, top: 48, width: 534, height: 534 });
    expect(panel).toEqual({ left: 630, top: 48, width: 522, height: 534 });
    expect([inner, content]).toEqual([442, 438]);
  });

  // Quand le canvas est large, le système doit le limiter à la place que laisse le texte, et le centrer en hauteur
  it("limits a wide canvas to the room the text leaves, and centers it vertically", () => {
    const { canvas, panel, inner } = previewGeometry(256, 144);

    expect(canvas).toEqual({ left: 48, top: 131, width: 656, height: 369 });
    expect(panel).toEqual({ left: 752, top: 48, width: 400, height: 534 });
    expect(inner).toBe(320);
  });

  // Quand le canvas est haut, le système doit le limiter à la hauteur utile : le panneau prend tout le reste
  it("limits a tall canvas to the useful height: the panel takes the rest", () => {
    const { canvas, panel } = previewGeometry(72, 128);

    expect(canvas).toEqual({ left: 48, top: 48, width: 300, height: 534 });
    expect(panel).toEqual({ left: 396, top: 48, width: 756, height: 534 });
  });

  // Quand le facteur n'est pas entier, le canvas doit remplir sa place au pixel près, sans jamais dépasser
  it("fills its place to the pixel with a factor that is not whole, never overflowing", () => {
    for (const [cols, rows] of [
      [200, 200],
      [240, 180],
      [180, 240],
      [64, 36],
      [36, 64],
      [100, 100],
    ] as const) {
      const { canvas, panel } = previewGeometry(cols, rows);
      expect(canvas.width <= 656 && canvas.height <= 534).toBe(true);
      expect(canvas.width === 656 || canvas.height === 534).toBe(true);
      expect(panel.left).toBe(canvas.left + canvas.width + 48);
      expect(panel.left + panel.width).toBe(1152);
    }
  });
});

describe("les tailles de texte de l'image d'aperçu", () => {
  // Quand le panneau est large ou étroit, le système doit suivre sa largeur entre les bornes de l'invitation et du pseudo
  it("follows the width of the panel between the bounds of the invitation and the name", () => {
    expect([invitationSize(320), invitationSize(442), invitationSize(676)]).toEqual([31, 43, 48]);
    expect([nameSize(320), nameSize(442), nameSize(676)]).toEqual([62, 96, 96]);
    expect([invitationSize(100), nameSize(100)]).toEqual([28, 52]);
  });

  // Quand la taille du pseudo est donnée, le système doit en tirer l'avatar, l'écart et l'initiale à leurs proportions
  it("derives the avatar, the gap and the initial from the size of the name", () => {
    expect([avatarSize(96), nameGap(96), initialSize(avatarSize(96))]).toEqual([110, 29, 50]);
    expect([avatarSize(52), nameGap(52), initialSize(avatarSize(52))]).toEqual([60, 16, 27]);
  });
});

describe("le pseudo qui doit tenir sur sa ligne", () => {
  // Si le pseudo et l'avatar tiennent à la taille voulue, alors le système ne doit pas la changer
  it("keeps the wanted size when the name and the avatar fit", () => {
    const fit = fitName({ width100: 200, available: 438, size: 62 });

    expect(fit).toEqual({ size: 62, isTruncated: false });
  });

  // Si le pseudo est trop long pour la ligne, alors le système doit prendre la plus grande taille qui tient
  it("takes the largest size that fits when the name is too long for the line", () => {
    const { size, isTruncated } = fitName({ width100: 333, available: 438, size: 96 });

    expect(isTruncated).toBe(false);
    expect((333 * size) / 100 + avatarSize(size) + nameGap(size)).toBeLessThanOrEqual(438);
    expect((333 * (size + 1)) / 100 + avatarSize(size + 1) + nameGap(size + 1)).toBeGreaterThan(438);
  });

  // Si même 36 px ne tiennent pas, alors le système doit s'arrêter à 36 px et couper le pseudo
  it("stops at 36 pixels and truncates the name when even that does not fit", () => {
    expect(fitName({ width100: 1988, available: 438, size: 96 })).toEqual({ size: 36, isTruncated: true });
  });
});

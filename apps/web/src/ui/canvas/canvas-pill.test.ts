import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProfileUser } from "../design/profile";
import { CanvasPill, type CanvasPillFold } from "./canvas-pill";
import { createGestureTracker, type Gesture, movesViewport, type PointerInput } from "./gestures";

// Écart §8.1 (JOURNAL 2026-10-08) : sur mobile, la pill Canvas se replie sur la photo quand on déplace, zoome ou ouvre une case.

// Un attribut `style` : la CSP de production bloque celui du HTML que le serveur écrit (archive-server-html.test.ts).
const INLINE_STYLE = /\sstyle=/;

const owner: ProfileUser = { displayName: "Kalyss", login: "kalyss" };
const live: ProfileUser = { ...owner, twitchLive: { category: "Art" } };
const folded: CanvasPillFold = { isFolded: true, onUnfold: () => undefined };
const unfolded: CanvasPillFold = { isFolded: false, onUnfold: () => undefined };

type Rendering = { isCompact?: boolean; fold?: CanvasPillFold };

const render = (profile: ProfileUser, { isCompact = true, fold }: Rendering = {}) =>
  renderToString(
    createElement(CanvasPill, { owner: profile, isCompact, isDocked: false, ...(fold ? { fold } : {}) }),
  );

describe("the Canvas pill, folded on a compact screen", () => {
  // Tant que la pill est repliée, elle n'est que la photo, dans un bouton nommé qui dit qu'il est replié
  it("is the photo alone, in a named button that says it is folded", () => {
    const html = render(owner, { fold: folded });

    expect(html).toContain('<button type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Déplier le profil de Kalyss"');
    expect(html).toContain('title="Déplier le profil de Kalyss"');
    expect(html).toContain("lp-avatar");
  });

  // Repliée, ni le nom, ni le lien vers le canvas, ni la chaîne Twitch : rien qui ne mène ailleurs que le bouton
  it("shows neither the name, nor the link to the canvas, nor the Twitch channel", () => {
    const html = render(live, { fold: folded });

    expect(html).not.toContain("lp-profile-name");
    expect(html).not.toContain("lp-profile-main");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("lp-btn--live");
  });

  // Quand le streamer est en live, le rond violet de Twitch reste sur la photo, et le nom du bouton le dit
  it("keeps the violet live dot on the photo when the owner is live, and says so in the button's name", () => {
    const html = render(live, { fold: folded });

    expect(html).toContain("lp-avatar-dot lp-avatar-dot--live");
    expect(html).toContain('aria-label="Déplier le profil de Kalyss, en live sur Twitch"');
  });

  // Hors live, aucun rond : il ne dit rien de plus
  it("has no dot when the owner is not live", () => {
    expect(render(owner, { fold: folded })).not.toContain("lp-avatar-dot");
  });

  // Aucun `style` dans le HTML du serveur : le rond passe par une classe et un token
  it("carries no inline style in the HTML the server writes", () => {
    expect(render(live, { fold: folded })).not.toMatch(INLINE_STYLE);
  });
});

describe("the Canvas pill, when it stays whole", () => {
  const whole = (html: string) => {
    expect(html).toContain('href="/kalyss"');
    expect(html).toContain('<span class="lp-profile-name lp-type-title">Kalyss</span>');
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("lp-avatar-dot");
  };

  // Un PC ne change pas : même repliée par un geste, la pill y reste entière
  it("stays whole on a PC, even after a gesture", () => {
    whole(render(owner, { isCompact: false, fold: folded }));
  });

  // Avant la première action sur le canvas, ou une fois dépliée par un toucher, la pill est celle d'avant
  it("is the profile with its name before the first gesture, and once unfolded by a touch", () => {
    whole(render(owner, { fold: unfolded }));
    whole(render(owner));
  });

  // Entière et en live, c'est le bouton Twitch teinté qui dit le live, comme avant
  it("tells the live with the tinted Twitch button, as before", () => {
    const html = render(live, { fold: unfolded });

    expect(html).toContain("lp-btn--live");
    expect(html).not.toContain("lp-avatar-dot");
  });
});

describe("the game page folding the Canvas pill (Écart §8.1, JOURNAL 2026-10-08)", () => {
  const source = (...path: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...path), "utf8");

  // Le canvas dit ses actions à la page : sans cet appel, rien ne se replie
  it("has the canvas tell the page of its actions, and the page fold the pill from it", () => {
    expect(source("ui", "canvas", "canvas-scene.ts")).toContain("options.onGesture()");
    expect(source("ui", "canvas", "pixel-canvas.tsx")).toContain("onGesture");
    const route = source("routes", "$login.tsx");

    expect(route).toContain("onGesture={foldCanvasPill}");
    expect(route).toContain("onUnfold: unfoldCanvasPill");
  });
});

describe("what folds the Canvas pill (Écart §8.1, JOURNAL 2026-10-08)", () => {
  const finger = (pointerId: number, x: number, y: number): PointerInput => ({
    pointerId,
    pointerType: "touch",
    button: 0,
    point: { x, y },
  });
  const mouse = (x: number, y: number): PointerInput => ({
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    point: { x, y },
  });
  const folds = (gestures: readonly Gesture[]) => gestures.some(movesViewport);
  const scene = () => readFileSync(join(import.meta.dirname, "canvas-scene.ts"), "utf8");

  // Un appui sans suite ne replie rien : le doigt qui tremble sous la tolérance et se lève vise une case, sans déplacer
  it("does not fold on a tap with no follow-up, the finger wobbling within the tolerance", () => {
    const tracker = createGestureTracker();
    const gestures = [
      tracker.press(finger(1, 100, 100)),
      tracker.move(finger(1, 104, 102)),
      tracker.release(finger(1, 104, 102)),
    ];

    expect(gestures.at(-1)).toEqual({ kind: "target", point: { x: 100, y: 100 } });
    expect(folds(gestures)).toBe(false);
  });

  // Une souris qui survole vise une case : rien ne se replie
  it("does not fold on a mouse hovering a cell", () => {
    expect(folds([createGestureTracker().move(mouse(40, 50))])).toBe(false);
  });

  // Un trait en Dessin (Tracé armé) ne replie rien : le doigt trace au lieu de glisser
  it("does not fold on a stroke in Draft mode, where the finger traces instead of dragging", () => {
    const tracker = createGestureTracker({ isTouchTracing: () => true });
    const gestures = [
      tracker.press(finger(1, 100, 100)),
      tracker.move(finger(1, 140, 100)),
      tracker.move(finger(1, 180, 130)),
      tracker.release(finger(1, 180, 130)),
    ];

    expect(gestures.map(({ kind }) => kind)).toEqual(["trace", "trace", "trace", "traceEnd"]);
    expect(folds(gestures)).toBe(false);
  });

  // Un déplacement reconnu, au-delà de la tolérance tactile, replie
  it("folds on a drag, once past the touch tolerance", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));

    expect(folds([tracker.move(finger(1, 106, 100))])).toBe(false);
    expect(folds([tracker.move(finger(1, 112, 100))])).toBe(true);
  });

  // Un pincement, deux doigts qui s'écartent, replie
  it("folds on a pinch", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 300));
    tracker.press(finger(2, 200, 300));

    expect(folds([tracker.move(finger(2, 260, 300))])).toBe(true);
  });

  // Un zoom ou un dézoom, à la molette ou aux boutons, replie
  it("folds on a zoom, either way", () => {
    expect(folds([{ kind: "zoom", point: { x: 10, y: 10 }, factor: 1.5 }])).toBe(true);
    expect(folds([{ kind: "zoom", point: { x: 10, y: 10 }, factor: 1 / 1.5 }])).toBe(true);
  });

  // Ouvrir une case ou zoomer dessus replie (Écart §9.3, JOURNAL 2026-10-09) ; un appui qui n'ouvre rien non : dans le vide il
  // ferme, en Dessin il bascule la case
  it("folds when a tap opens an inspection or zooms onto a cell, and not when it opens nothing", () => {
    expect(scene()).toMatch(
      /options\.onGesture\(\);\s*if \(target\) \{[^}]*startZoom\(target\);\s*\} else store\.inspect\(cell\.x, cell\.y\);/,
    );
    expect(scene()).not.toMatch(/draftStore\.toggleCell\(cell\.x, cell\.y\);\s*options\.onGesture/);
    expect(scene()).not.toMatch(/store\.closeInspection\(\);\s*options\.onGesture/);
  });

  // Recentrer replie aussi (Écart §8.1, JOURNAL 2026-10-09) : un appel suffit, comme pour un déplacement
  it("folds when Recenter is called", () => {
    expect(scene()).toMatch(/recenter\(\) \{[^}]*options\.onGesture\(\);[\s\S]*?startZoom\(/);
  });

  // Le contact lui-même ne replie plus : seul le geste que le suivi reconnaît appelle la page, dans la scène
  it("no longer folds on the raw contact, only on the gesture the tracker recognizes", () => {
    expect(scene()).toContain("if (movesViewport(gesture)) options.onGesture();");
    expect(scene()).not.toMatch(/"pointerdown",[\s\S]{0,300}options\.onGesture\(\)/);
  });
});

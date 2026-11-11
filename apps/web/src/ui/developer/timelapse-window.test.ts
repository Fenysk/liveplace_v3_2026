import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TimelapseState } from "./timelapse-run";
import { TimelapseBody } from "./timelapse-window";

const noop = (): void => undefined;
const render = (state: TimelapseState): string =>
  renderToStaticMarkup(createElement(TimelapseBody, { state, onRetry: noop }));

describe("le contenu de la fenêtre du GIF timelapse (JOURNAL 2026-11-11)", () => {
  // Quand le serveur rejoue l'historique, alors une barre sans valeur et « Lecture de l'historique… ».
  it("shows an unfilled progress bar while the history is read", () => {
    const html = render({ kind: "reading" });

    expect(html).toContain("Lecture de l&#x27;historique…");
    expect(html).toContain("<progress");
    expect(html).not.toContain('value="');
  });

  // Quand le Worker dessine, alors la barre avance et la ligne dit l'image en cours sur le total.
  it("shows the image being drawn out of the total", () => {
    const html = render({ kind: "drawing", done: 312, total: 840 });

    expect(html).toContain("Image 312 sur 840");
    expect(html).toContain('value="312"');
    expect(html).toContain('max="840"');
  });

  // Quand le GIF est prêt, alors l'aperçu, la ligne de mesures et un seul bouton plein qui télécharge sous le nom du fichier.
  it("previews the GIF and offers one download button with the name of the file", () => {
    const html = render({
      kind: "ready",
      url: "blob:http://localhost/abc",
      fileName: "liveplace-kalyss-2026-11-11.gif",
      summary: "32 s · 630×504 · 2,4 Mo",
    });

    expect(html).toContain('src="blob:http://localhost/abc"');
    expect(html).toContain("32 s · 630×504 · 2,4 Mo");
    expect(html).toContain('download="liveplace-kalyss-2026-11-11.gif"');
    expect(html).toContain('href="blob:http://localhost/abc"');
    expect(html.match(/lp-btn--primary/g)).toHaveLength(1);
  });

  // Quand il n'y a rien à animer, alors le message le dit, sans Réessayer : recommencer n'y changerait rien.
  it("says there is nothing to animate, without a retry button", () => {
    const html = render({ kind: "failed", reason: "noChanges" });

    expect(html).toContain("Cette fresque n&#x27;a encore aucun dessin à animer.");
    expect(html).not.toContain("Réessayer");
  });

  // Quand l'historique est trop long, alors le message le dit, sans Réessayer.
  it("says the history is too long, without a retry button", () => {
    const html = render({ kind: "failed", reason: "tooManyChanges" });

    expect(html).toContain("Historique trop long pour un GIF.");
    expect(html).not.toContain("Réessayer");
  });

  // Quand la création échoue pour une autre raison, alors le message général et Réessayer.
  it("offers a retry when the GIF could not be made", () => {
    const html = render({ kind: "failed", reason: "failed" });

    expect(html).toContain("Le GIF n&#x27;a pas pu être créé.");
    expect(html).toContain("Réessayer");
  });
});

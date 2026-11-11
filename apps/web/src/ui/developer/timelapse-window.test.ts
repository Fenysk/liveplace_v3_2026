import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TIMELAPSE_START, type TimelapseState } from "./timelapse-run";
import { TimelapseBody } from "./timelapse-window";

const noop = (): void => undefined;
const render = (state: TimelapseState): string =>
  renderToStaticMarkup(createElement(TimelapseBody, { state, onRetry: noop }));

describe("le contenu de la fenêtre du GIF timelapse (JOURNAL 2026-11-11)", () => {
  // Quand le serveur rejoue l'historique, alors une barre sans valeur et « Lecture de l'historique… ».
  it("shows an unfilled progress bar while the history is read", () => {
    const html = render(TIMELAPSE_START);

    expect(html).toContain("Lecture de l&#x27;historique…");
    expect(html).toContain("<progress");
    expect(html).not.toContain('value="');
  });

  // Quand le Worker dessine, alors la barre avance et la ligne dit l'image en cours sur le total.
  it("shows the image being drawn out of the total", () => {
    const html = render({ kind: "drawing", seconds: 45, done: 312, total: 840 });

    expect(html).toContain("Image 312 sur 840");
    expect(html).toContain('value="312"');
    expect(html).toContain('max="840"');
  });

  // Quand le serveur dit combien de poses porte le flux, alors la ligne le dit en français, sans barre qui avance.
  it("shows the poses of the Redis stream, with the number in French format", () => {
    const html = render({ kind: "reading", seconds: 3, poses: 1104, chunks: null });

    expect(html).toContain(`Flux Redis : ${(1104).toLocaleString("fr-FR")} poses`);
    expect(html).not.toContain("Lecture de l&#x27;historique…");
    expect(html).not.toContain('value="');
  });

  // Quand le flux porte une seule pose, alors « 1 pose » au singulier.
  it("puts a single pose in the singular", () => {
    expect(render({ kind: "reading", seconds: 0, poses: 1, chunks: null })).toContain("Flux Redis : 1 pose<");
  });

  // Quand les chunks de Convex se lisent, alors « Chunks Convex : 12 sur 140 » et la barre avance, sous la ligne du flux.
  it("shows the Convex chunks read out of the total, under the stream line", () => {
    const html = render({ kind: "reading", seconds: 12, poses: 1104, chunks: { done: 12, total: 140 } });

    expect(html).toContain("Chunks Convex : 12 sur 140");
    expect(html).toContain("Flux Redis :");
    expect(html).toContain('value="12"');
    expect(html).toContain('max="140"');
  });

  // Quand le total des chunks est connu avant le premier, alors la barre est à zéro sur le total.
  it("starts the chunk bar at zero on the total", () => {
    const html = render({ kind: "reading", seconds: 4, poses: 20, chunks: { done: 0, total: 140 } });

    expect(html).toContain("Chunks Convex : 0 sur 140");
    expect(html).toContain('value="0"');
  });

  // Tant que la génération dure, alors les secondes écoulées se lisent, à chaque étape, hors de la zone que les lecteurs d'écran annoncent.
  it("shows the seconds on every step, outside the status line", () => {
    for (const state of [
      TIMELAPSE_START,
      { kind: "reading", seconds: 12, poses: 1104, chunks: null },
      { kind: "reading", seconds: 12, poses: 1104, chunks: { done: 12, total: 140 } },
      { kind: "drawing", seconds: 12, done: 3, total: 9 },
    ] satisfies TimelapseState[]) {
      const html = render(state);

      const status = /role="status"[^>]*>(.*?)<\/div>/.exec(html)?.[1] ?? "";

      expect(status).not.toBe("");
      expect(status).not.toMatch(/\d+ s</);
      expect(html).toMatch(/<p[^>]*>\d+ s<\/p>/);
    }
    expect(render({ kind: "reading", seconds: 12, poses: null, chunks: null })).toContain(">12 s<");
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

  // Quand un fichier de l'historique n'a pas répondu, alors le message le dit avec ses essais, et Réessayer.
  it("says a file of the history did not answer, with a retry button", () => {
    const html = render({ kind: "failed", reason: "historyTimeout" });

    expect(html).toContain("Un fichier de l&#x27;historique n&#x27;a pas répondu (2 essais de 20 s).");
    expect(html).toContain("Réessayer");
  });

  // Quand le flux est coupé avant la fin, alors le message le dit, et Réessayer.
  it("says the connection was cut, with a retry button", () => {
    const html = render({ kind: "failed", reason: "disconnected" });

    expect(html).toContain("La connexion au serveur a été coupée.");
    expect(html).toContain("Réessayer");
  });

  // Quand aucun octet n'arrive pendant 60 s, alors le message le dit, et Réessayer.
  it("says the server stopped answering for 60 seconds, with a retry button", () => {
    const html = render({ kind: "failed", reason: "silent" });

    expect(html).toContain("Le serveur ne répond plus depuis 60 s.");
    expect(html).toContain("Réessayer");
  });
});

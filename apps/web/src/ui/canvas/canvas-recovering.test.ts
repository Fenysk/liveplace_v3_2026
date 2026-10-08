import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type CanvasStore, createCanvasStore } from "../../state/canvas-store";
import { CanvasRecovering, isCanvasRecovering, useIsCanvasRecovering } from "./canvas-recovering";

// Un store dont le gateway a répondu ce code d'erreur au `hello`, ou rien.
const storeAfter = (code: "canvas_recovering" | "canvas_not_found" | null): CanvasStore => {
  const listening: { listeners?: TransportListeners } = {};
  const transport: Transport = {
    send: () => undefined,
    listen: (listeners) => {
      listening.listeners = listeners;
    },
    close: () => undefined,
  };
  const store = createCanvasStore("canvas-1", transport, {
    mode: "ui",
    now: Date.now,
    reload: () => undefined,
  });
  if (code) listening.listeners?.onFrame({ t: "error", code });
  return store;
};

const Probe = ({ canvas }: { canvas: CanvasStore | undefined }) =>
  createElement("p", null, String(useIsCanvasRecovering(canvas)));

const render = (canvas: CanvasStore | undefined): string =>
  renderToStaticMarkup(createElement(Probe, { canvas }));

describe("isCanvasRecovering (JOURNAL 2026-10-08)", () => {
  // Quand le gateway a répondu canvas_recovering, la page montre le message d'attente
  it("is true once the gateway answered canvas_recovering", () => {
    expect(isCanvasRecovering({ lastError: "canvas_recovering" })).toBe(true);
  });

  // Un canvas introuvable n'est pas un canvas en récupération, ni l'inverse
  it("is false without an error, for a missing canvas, or for any other code", () => {
    expect(isCanvasRecovering({ lastError: null })).toBe(false);
    expect(isCanvasRecovering({ lastError: "canvas_not_found" })).toBe(false);
    expect(isCanvasRecovering({ lastError: "rate_limited" })).toBe(false);
  });
});

describe("useIsCanvasRecovering", () => {
  // Quand le store a reçu canvas_recovering, le hook le dit
  it("follows the store: true after canvas_recovering", () => {
    expect(render(storeAfter("canvas_recovering"))).toContain("true");
  });

  // Avant les stores, ou sans erreur, ou pour un canvas introuvable : faux
  it("is false before the stores exist, without an error, and for a missing canvas", () => {
    expect(render(undefined)).toContain("false");
    expect(render(storeAfter(null))).toContain("false");
    expect(render(storeAfter("canvas_not_found"))).toContain("false");
  });
});

describe("the waiting message", () => {
  // Le message est exactement celui voulu, dans la page du jeu (cachée en vue OBS)
  it("says exactly what the streamer's viewers read, inside lp-game", () => {
    const html = renderToStaticMarkup(createElement(CanvasRecovering));

    expect(html).toContain("On remet chaque pixel à sa place. Le canvas revient dans un instant !");
    expect(html).toContain('class="lp-game"');
  });

  // Aucun style en ligne : la CSP de production le refuse
  it("renders no inline style, which the production CSP refuses", () => {
    expect(renderToStaticMarkup(createElement(CanvasRecovering))).not.toContain("style=");
  });
});

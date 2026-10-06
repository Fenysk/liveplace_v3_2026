import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type CanvasStore, createCanvasStore } from "../../state/canvas-store";
import { isCanvasMissing, useIsCanvasMissing } from "./canvas-missing";

// Un store dont le gateway a (ou non) répondu `canvas_not_found` au `hello`.
const storeAfter = (code: "canvas_not_found" | "rate_limited" | null): CanvasStore => {
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
  createElement("p", null, String(useIsCanvasMissing(canvas)));

const render = (canvas: CanvasStore | undefined): string =>
  renderToStaticMarkup(createElement(Probe, { canvas }));

describe("isCanvasMissing (CDC 2026, canvas introuvable)", () => {
  // Quand le gateway a répondu canvas_not_found, la page montre la notice du canvas introuvable
  it("is true once the gateway answered canvas_not_found", () => {
    expect(isCanvasMissing({ lastError: "canvas_not_found" })).toBe(true);
  });

  // Pour tout autre code, ou sans erreur, la page ne change pas
  it("is false without an error, or for any other code", () => {
    expect(isCanvasMissing({ lastError: null })).toBe(false);
    expect(isCanvasMissing({ lastError: "rate_limited" })).toBe(false);
    expect(isCanvasMissing({ lastError: "forbidden" })).toBe(false);
  });
});

describe("useIsCanvasMissing", () => {
  // Quand le store a reçu canvas_not_found, le hook le dit
  it("follows the store: true after canvas_not_found", () => {
    expect(render(storeAfter("canvas_not_found"))).toContain("true");
  });

  // Avant les stores (rendu serveur, puis le temps de les ouvrir), ou sans erreur : faux
  it("is false before the stores exist, and without an error", () => {
    expect(render(undefined)).toContain("false");
    expect(render(storeAfter(null))).toContain("false");
    expect(render(storeAfter("rate_limited"))).toContain("false");
  });
});

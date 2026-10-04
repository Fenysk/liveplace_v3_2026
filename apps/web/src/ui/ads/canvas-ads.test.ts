import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasAds } from "./canvas-ads";

describe("CanvasAds", () => {
  // Quand le serveur rend la page, le système ne doit montrer ni pill de consentement, ni pub, ni script :
  // le choix ne se lit qu'après l'hydratation (un visiteur qui a déjà choisi ne voit jamais la pill)
  it("renders nothing on the server, before the choice is read", () => {
    expect(renderToString(createElement(CanvasAds))).toBe("");
  });
});

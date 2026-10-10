import { PALETTE } from "@liveplace/domain";
import type { AuthoredPixel } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastAnnouncementContext } from "../design/toast-announcement";
import { PLACEMENT_ONLY } from "./cleared-pixels";
import { MODERATION_TEXTS } from "./moderation-texts";
import { ModerationWindow, type ModerationWindowProps } from "./moderation-window";

const CONNECTION_LOST = MODERATION_TEXTS.fr.connectionLost;

const noop = () => undefined;

const author = { userId: "3", displayName: "Troll42", placementId: "pdemo0001" };

const pixels: AuthoredPixel[] = [
  { x: 1, y: 2, colorIndex: 3, placedAt: 1_700_000_000_000, placementId: "pdemo0001" },
  { x: 2, y: 2, colorIndex: 3, placedAt: 1_700_000_000_000, placementId: "pdemo0001" },
];

const props = (overrides: Partial<ModerationWindowProps> = {}): ModerationWindowProps => ({
  request: { kind: "ban", author },
  pixels,
  scope: PLACEMENT_ONLY,
  status: "idle",
  canvas: { width: 4, height: 4, palette: PALETTE },
  onScope: noop,
  onConfirm: noop,
  onClose: noop,
  ...overrides,
});

const render = (overrides: Partial<ModerationWindowProps> = {}) =>
  renderToStaticMarkup(createElement(ModerationWindow, props(overrides)));

// Le contenu du décompte (la région d'état) et celui de l'alerte, `undefined` si la fenêtre n'en a pas.
const countOf = (markup: string): string | undefined =>
  markup.match(/<p[^>]* role="status"[^>]*>(.*?)<\/p>/)?.[1];
const alertOf = (markup: string): string | undefined =>
  markup.match(/<span[^>]* role="alert"[^>]*>(.*?)<\/span>/)?.[1];

describe("what a screen reader hears of the moderation window", () => {
  // La fenêtre a ses deux régions avant tout message : l'alerte est vide tant que rien n'a échoué, l'état tant que l'aperçu se charge
  it("has its alert and its count before they have anything to say", () => {
    const loading = render({ pixels: null });

    expect(alertOf(loading)).toBe("");
    expect(countOf(loading)).toBe("");
  });

  // Le décompte et la conséquence se disent d'un trait quand l'aperçu arrive
  it("says the count and the consequence in one go once the preview arrives", () => {
    const markup = render({ request: { kind: "ban", author } });

    expect(countOf(markup)).toBe(
      "2 pixels. Ce compte ne pourra plus poser sur cette fresque, et ses pixels seront retirés.",
    );
  });

  // Signaler dit sa propre conséquence
  it("says its own consequence when reporting", () => {
    const markup = render({
      request: { kind: "report", author: { x: 1, y: 2, displayName: "Troll42", placementId: "pdemo0001" } },
    });

    expect(countOf(markup)).toContain("Assez de signalements");
  });

  // Une connexion coupée se dit tout de suite, dans l'alerte, avec la phrase de la fenêtre
  it("says a lost connection at once, in the alert, with the window's own sentence", () => {
    expect(alertOf(render({ status: "failed" }))).toBe(CONNECTION_LOST);
    expect(alertOf(render({ status: "idle" }))).toBe("");
  });

  // Une fenêtre modale rend la page inerte : le toast que son action lève se redit dans la sienne, qui n'est pas inerte
  it("repeats the toast its own action raises, the page behind it being inert", () => {
    const toast = { id: 1, tone: "success", text: "Troll42 est banni·e de cette fresque" } as const;
    const markup = renderToStaticMarkup(
      createElement(
        ToastAnnouncementContext.Provider,
        { value: toast },
        createElement(ModerationWindow, props()),
      ),
    );

    expect(markup).toMatch(/<dialog.*<div role="status" class="lp-visually-hidden"><span>Troll42 est banni/s);
  });

  // Le titre qui suit un retrait se dit : « C'est retiré. » n'est écrit nulle part ailleurs
  it("says the title that follows a removal, which is the only place that says it is removed", () => {
    const markup = render({ request: { kind: "banAfterClear", author } });

    expect(markup).toContain(
      '<span role="status" class="lp-visually-hidden">C&#x27;est retiré. Bannir aussi Troll42 ?</span>',
    );
    expect(render({ request: { kind: "ban", author } })).toContain(
      '<span role="status" class="lp-visually-hidden"></span>',
    );
  });
});

import { PALETTE } from "@liveplace/domain";
import { Settings } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BannedWindow } from "../moderation/banned-window";
import { Window } from "./window";

const doNothing = (): void => undefined;

const canvas = { width: 8, height: 8, palette: PALETTE };

const bannedWindow = (isOpen: boolean): string =>
  renderToStaticMarkup(createElement(BannedWindow, { isOpen, pixels: null, canvas, onClose: doNothing }));

// Le contenu de la section : les fenêtres le demandent dans leurs props, que `createElement` n'accepte qu'ainsi.
const content = { children: createElement("p", null, "contenu de la section") };

const largeWindow = (isOpen: boolean): string =>
  renderToStaticMarkup(
    createElement(Window, {
      isOpen,
      sections: [{ id: "account", label: "Mon compte", icon: Settings }],
      sectionId: "account",
      onSelect: doNothing,
      onClose: doNothing,
      ...content,
    }),
  );

describe("what a closed window leaves in the page", () => {
  // Une petite fenêtre fermée ne garde ni son titre, ni son texte, ni ses boutons : un outil qui lit le DOM sans le CSS n'y trouve rien
  it("leaves nothing in the DOM of a closed small window, only its empty dialog", () => {
    const markup = bannedWindow(false);

    expect(markup).toMatch(/<dialog[^>]*><\/dialog>/);
    expect(markup).not.toContain("Tu es banni·e de cette fresque");
    expect(markup).not.toContain("Je comprends");
    expect(markup).not.toContain("Fermer");
    expect(markup).not.toContain("Tu peux seulement regarder");
  });

  // Ouverte, elle écrit son contenu dès son rendu, avant `showModal()` : la transition part de l'état fermé
  it("writes the content of an open small window in the render itself, before any effect runs", () => {
    const markup = bannedWindow(true);

    expect(markup).toContain("Tu es banni·e de cette fresque");
    expect(markup).toContain("Je comprends");
    expect(markup).toContain("Fermer");
  });

  // La grande fenêtre reste montée fermée : ses sections chargent au montage, tiennent un envoi, portent des petites fenêtres
  it("keeps the content of a closed large window, which its sections count on", () => {
    const markup = largeWindow(false);

    expect(markup).toContain("contenu de la section");
    expect(markup).toContain("Mon compte");
    expect(markup).toContain("Fermer");
    expect(largeWindow(true)).toContain("contenu de la section");
  });
});

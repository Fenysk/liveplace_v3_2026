import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "../locale/locale";
import { LocaleProvider } from "../locale/use-locale";
import { HOME_HEAD_TEXTS } from "./home-head-texts";
import { useHomeHead } from "./use-home-head";

// Le rendu du serveur ne lance aucun effet : ici, l'effet part au rendu, de quoi lire ce que la page écrit dans l'onglet sans navigateur.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void) => {
    effect();
  },
}));

const written = { title: "", description: "" };

const stubDocument = (hasDescriptionTag: boolean) => {
  const meta = {
    setAttribute: (name: string, value: string) => {
      if (name === "content") written.description = value;
    },
  };
  vi.stubGlobal("document", {
    set title(value: string) {
      written.title = value;
    },
    querySelector: (selector: string) =>
      hasDescriptionTag && selector === 'meta[name="description"]' ? meta : null,
  });
};

const Probe = () => {
  useHomeHead();
  return null;
};

const openHome = (locale: Locale): void => {
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(Probe)));
};

afterEach(() => {
  vi.unstubAllGlobals();
  written.title = "";
  written.description = "";
});

describe("l'onglet de la page d'accueil suit la langue (Écart §14, JOURNAL 2026-10-22)", () => {
  // Quand la page est dans une langue, le titre de l'onglet et la description sont écrits dans cette langue
  it("writes the title of the tab and the description in the language of the page", () => {
    stubDocument(true);

    openHome("fr");
    expect(written).toEqual({ title: HOME_HEAD_TEXTS.fr.title, description: HOME_HEAD_TEXTS.fr.description });

    openHome("en");
    expect(written).toEqual({ title: HOME_HEAD_TEXTS.en.title, description: HOME_HEAD_TEXTS.en.description });
    expect(written.title).toBe("LivePlace · A pixel canvas for your Twitch stream");
  });

  // Si la page n'a pas de balise de description, alors le titre de l'onglet est quand même écrit, sans erreur
  it("still writes the title of the tab when the page has no description tag", () => {
    stubDocument(false);

    expect(() => openHome("en")).not.toThrow();
    expect(written).toEqual({ title: HOME_HEAD_TEXTS.en.title, description: "" });
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "./locale";
import { LocaleProvider, useLocale } from "./use-locale";

// Le rendu du serveur ne lance aucun effet : ici l'effet part une fois au rendu, comme le navigateur le lance après l'hydratation.
let hasRun = false;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void) => {
    if (hasRun) return;
    hasRun = true;
    effect();
  },
}));

const Probe = () => createElement("span", null, useLocale());

const openPage = (initial: Locale, cookie: string): string => {
  vi.stubGlobal("document", { cookie });
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  return renderToStaticMarkup(createElement(LocaleProvider, { initial }, createElement(Probe)));
};

afterEach(() => {
  vi.unstubAllGlobals();
  hasRun = false;
});

describe("la langue de la page suit le cookie (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand le retour arrière reprend un HTML rendu en français alors que le cookie dit l'anglais, la page passe à l'anglais
  it("switches to the language of the cookie when the page was rendered in another one", () => {
    expect(openPage("fr", "lp_locale=en")).toBe("<span>en</span>");
  });

  // Quand le cookie et la page disent la même langue, ou que le cookie n'en dit aucune, la page reste comme le serveur l'a rendue
  it("stays as the server rendered it when the cookie agrees or says nothing", () => {
    expect(openPage("en", "lp_locale=en")).toBe("<span>en</span>");
    expect(openPage("en", "lp_session=abc")).toBe("<span>en</span>");
  });
});

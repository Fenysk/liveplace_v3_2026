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

// Le navigateur a ouvert la page en `navigationType` ; le serveur dit `saved` pour le cookie, que la page ne lit pas.
const openPage = (initial: Locale, navigationType: string, saved: Locale | null) => {
  const asked: string[] = [];
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("performance", { getEntriesByType: () => [{ type: navigationType }] });
  vi.stubGlobal("fetch", async (path: string) => {
    asked.push(path);
    return Response.json({ ok: true, locale: saved });
  });
  const html = renderToStaticMarkup(createElement(LocaleProvider, { initial }, createElement(Probe)));
  return { html, asked };
};

afterEach(() => {
  vi.unstubAllGlobals();
  hasRun = false;
});

describe("la langue de la page suit le cookie, lu par le serveur (§9.9)", () => {
  // Le HTML d'un retour arrière est rendu avant le dernier choix : la page demande la langue au serveur, qui lit le cookie
  it("asks the server for the language of the cookie when the page comes back from the history", () => {
    const { html, asked } = openPage("fr", "back_forward", "en");

    expect(html).toBe("<span>fr</span>");
    expect(asked).toEqual(["/auth/locale"]);
  });

  // Une visite ordinaire est rendue d'après le cookie : la page reste comme le serveur l'a rendue, sans l'interroger
  it("stays as the server rendered it, without asking, on an ordinary visit", () => {
    const { html, asked } = openPage("en", "navigate", "en");

    expect(html).toBe("<span>en</span>");
    expect(asked).toEqual([]);
  });
});

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LocalePicker } from "../design/locale-controls";
import type { Locale } from "./locale";
import {
  FixedLocale,
  followSavedLocale,
  LocaleProvider,
  useLocale,
  usePickLocale,
  useTexts,
} from "./use-locale";

const inLocale = (initial: Locale, child: ReactNode): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial }, child));

const Probe = () => createElement("span", null, useLocale());
const ProbeText = () => createElement("span", null, useTexts(DESIGN_TEXTS).language);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("la langue de la page (§9.9)", () => {
  // Quand la page est rendue sans fournisseur, le système doit parler français
  it("speaks French outside a provider", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>fr</span>");
    expect(renderToStaticMarkup(createElement(ProbeText))).toBe("<span>Langue</span>");
  });

  // Quand le serveur donne la langue du visiteur, les composants lisent cette langue et ses phrases
  it("gives the language the server resolved, and the sentences of that language", () => {
    expect(inLocale("en", createElement(Probe))).toBe("<span>en</span>");
    expect(inLocale("en", createElement(ProbeText))).toBe("<span>Language</span>");
    expect(inLocale("fr", createElement(ProbeText))).toBe("<span>Langue</span>");
  });

  // Une langue imposée à ce qui est dessous l'emporte sur celle de la page
  it("lets a fixed language win over the one of the page for what is below it", () => {
    const html = inLocale("en", createElement(FixedLocale, { locale: "fr" }, createElement(Probe)));

    expect(html).toBe("<span>fr</span>");
  });
});

describe("le choix de la langue (§9.9)", () => {
  // Sous une langue imposée (la fenêtre Développeur), le choix reste dans cette langue, quelle que soit celle de la page
  it("keeps the picker in a fixed language, whatever the language of the page", () => {
    const html = inLocale("en", createElement(FixedLocale, { locale: "fr" }, createElement(LocalePicker)));

    expect(html).toContain('aria-label="Langue"');
    expect(html).not.toContain('aria-label="Language"');
    expect(html).toContain("Français");
    expect(html).toContain("English");
    expect(html).toMatch(/checked=""[^>]*value="fr"/);
    expect(html).not.toMatch(/checked=""[^>]*value="en"/);
  });

  // Le choix propose chaque langue écrite dans sa propre langue, la courante cochée
  it("offers each language in its own language, the current one checked", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale, createElement(LocalePicker));

      expect(html).toContain("Français");
      expect(html).toContain("English");
      expect(html).toMatch(new RegExp(`checked=""[^>]*value="${locale}"`));
      expect(html).not.toMatch(new RegExp(`checked=""[^>]*value="${locale === "fr" ? "en" : "fr"}"`));
    }
    expect(inLocale("fr", createElement(LocalePicker))).toContain('aria-label="Langue"');
    expect(inLocale("en", createElement(LocalePicker))).toContain('aria-label="Language"');
  });

  // Choisir une langue la fait retenir par le serveur, et la page n'écrit jamais le cookie elle-même
  it("asks the server to keep the picked language and never writes the cookie itself", () => {
    const sent: { path: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
      sent.push({ path, init });
      return new Response(null, { status: 200 });
    });
    const written: string[] = [];
    vi.stubGlobal("document", {
      set cookie(value: string) {
        written.push(value);
      },
    });
    let pick: (locale: Locale) => void = () => undefined;
    const Capture = () => {
      pick = usePickLocale();
      return null;
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined); // l'état d'un rendu serveur ne se change pas

    inLocale("fr", createElement(Capture));
    pick("en");

    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe("/auth/locale");
    expect(sent[0]?.init).toMatchObject({ method: "POST", body: JSON.stringify({ locale: "en" }) });
    expect(written).toEqual([]);
  });
});

describe("la page suit la langue retenue par le serveur (§9.9)", () => {
  const plugPage = (navigationType: string, saved: unknown) => {
    const listeners = new Map<string, (event: { persisted: boolean }) => void>();
    const asked: string[] = [];
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: (event: { persisted: boolean }) => void) =>
        listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    vi.stubGlobal("performance", { getEntriesByType: () => [{ type: navigationType }] });
    vi.stubGlobal("fetch", async (path: string) => {
      asked.push(path);
      return Response.json({ ok: true, locale: saved });
    });
    return { listeners, asked };
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Quand le retour arrière reprend un HTML rendu avant le dernier choix, la page passe à la langue que le serveur a retenue
  it("asks the server and applies its language when the page comes back from the history", async () => {
    const { asked } = plugPage("back_forward", "en");
    const seen: Locale[] = [];

    followSavedLocale((locale) => seen.push(locale));
    await settle();

    expect(asked).toEqual(["/auth/locale"]);
    expect(seen).toEqual(["en"]);
  });

  // Une visite ordinaire vient d'être rendue d'après le cookie : le serveur n'est pas interrogé
  it("does not ask the server on an ordinary visit", async () => {
    const { asked } = plugPage("navigate", "en");

    followSavedLocale(() => undefined);
    await settle();

    expect(asked).toEqual([]);
  });

  // Une page sortie du bfcache date d'avant le dernier choix, un affichage ordinaire non
  it("asks the server when a page is restored from the bfcache, until it is unplugged", async () => {
    const { listeners, asked } = plugPage("navigate", "fr");
    const seen: Locale[] = [];

    const unplug = followSavedLocale((locale) => seen.push(locale));
    listeners.get("pageshow")?.({ persisted: false });
    await settle();
    expect(asked).toEqual([]);

    listeners.get("pageshow")?.({ persisted: true });
    await settle();
    expect(asked).toEqual(["/auth/locale"]);
    expect(seen).toEqual(["fr"]);

    unplug();
    expect(listeners.has("pageshow")).toBe(false);
  });

  // Sans cookie, le serveur ne dit aucune langue : la page garde celle qu'elle a rendue
  it("keeps the language of the page when the server has none", async () => {
    plugPage("back_forward", null);
    const seen: Locale[] = [];

    followSavedLocale((locale) => seen.push(locale));
    await settle();

    expect(seen).toEqual([]);
  });

  // Quand le serveur ne répond pas, la page garde sa langue et le dit dans la console, sans rien casser
  it("keeps the language of the page when the server does not answer", async () => {
    plugPage("back_forward", "en");
    vi.stubGlobal("fetch", async () => {
      throw new Error("hors ligne");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seen: Locale[] = [];

    followSavedLocale((locale) => seen.push(locale));
    await settle();

    expect(seen).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  // Sans entrée de navigation (un vieux navigateur), la page ne sait pas qu'elle vient de l'historique : elle n'interroge pas le serveur
  it("does not ask the server when the browser tells nothing about the navigation", async () => {
    const { asked } = plugPage("navigate", "en");
    vi.stubGlobal("performance", { getEntriesByType: () => [] });

    followSavedLocale(() => undefined);
    await settle();

    expect(asked).toEqual([]);
  });

  // Seul un retour du bfcache compte : un `pageshow` ordinaire, au premier affichage, n'appelle rien
  it("ignores a pageshow that is not a restored page", async () => {
    const { listeners, asked } = plugPage("navigate", "en");

    followSavedLocale(() => undefined);
    listeners.get("pageshow")?.({ persisted: false });
    await settle();

    expect(asked).toEqual([]);
    expect(listeners.has("pageshow")).toBe(true);
  });
});

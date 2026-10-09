import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LocalePicker } from "../design/locale-controls";
import { LOCALE_COOKIE, type Locale, resolveLocale } from "./locale";
import { FixedLocale, LocaleProvider, useLocale, useTexts, writeLocaleCookie } from "./use-locale";

const inLocale = (initial: Locale, child: ReactNode): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial }, child));

const Probe = () => createElement("span", null, useLocale());
const ProbeText = () => createElement("span", null, useTexts(DESIGN_TEXTS).language);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("la langue de la page (Écart §14, JOURNAL 2026-10-07)", () => {
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

describe("le choix de la langue (Écart §14, JOURNAL 2026-10-07)", () => {
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
});

describe("le cookie écrit par la page (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand le visiteur choisit une langue, le cookie est écrit, Secure en https seulement
  it("writes the cookie of the choice, Secure over https only", () => {
    const written: string[] = [];
    const document = {
      set cookie(value: string) {
        written.push(value);
      },
    };
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", { location: { protocol: "http:" } });
    writeLocaleCookie("en");
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    writeLocaleCookie("fr");

    expect(written).toEqual([
      "lp_locale=en; Path=/; Max-Age=31536000; SameSite=Lax",
      "lp_locale=fr; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    ]);
    expect(resolveLocale({ cookieHeader: written[0]?.split(";")[0], preferenceHeader: undefined })).toBe(
      "en",
    );
    expect(written.every((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))).toBe(true);
  });

  // Si le navigateur refuse le cookie, alors la page ne casse pas : la langue tient pour la page
  it("does not break the page when the browser refuses the cookie", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("document", {
      set cookie(_value: string) {
        throw new Error("cookie refusé");
      },
    });
    vi.stubGlobal("window", { location: { protocol: "http:" } });

    expect(() => writeLocaleCookie("en")).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

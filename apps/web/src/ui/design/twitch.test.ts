import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "../locale/locale";
import { LocaleProvider } from "../locale/use-locale";
import { SignInButton, SignInNote } from "./twitch";

const render = (element: ReturnType<typeof createElement>, locale: Locale = "fr"): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, element));

// Le texte que lit un outil d'accessibilité dans le lien : tout ce qui n'est pas une balise
const textOf = (html: string): string => html.replace(/<[^>]*>/g, "").trim();

describe("Se connecter, son nom accessible (Écart §9.1, JOURNAL 2026-10-31)", () => {
  // Quand le bouton a un libellé, son nom accessible est ce libellé seul : un `title` différent le contredirait (WCAG 2.5.3)
  it("names a button with a label by that label alone, with no title", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = render(
        createElement(SignInButton, { href: "/auth/twitch", label: "Lancer ma fresque" }),
        locale,
      );

      expect(html).not.toMatch(/\stitle=/);
      expect(html).not.toContain("aria-label");
      expect(html).not.toContain("Se connecter avec Twitch");
      expect(html).not.toContain("Sign in with Twitch");
      expect(textOf(html)).toBe("Lancer ma fresque");
      expect(html).toContain('href="/auth/twitch"');
      expect(html).toContain("lp-btn--twitch");
    }
  });

  // Quand le bouton n'a que le logo, son titre est son nom accessible, dans la langue de la page
  it("keeps the title on the logo alone, in the language of the page", () => {
    const french = render(createElement(SignInButton, { href: "/auth/twitch" }));
    const english = render(createElement(SignInButton, { href: "/auth/twitch" }), "en");

    expect(french).toContain('title="Se connecter avec Twitch"');
    expect(english).toContain('title="Sign in with Twitch"');
    expect(textOf(french)).toBe("");
    expect(french).toContain("lp-btn--icon");
  });
});

describe("la ligne sous Se connecter (Écart §9.1, JOURNAL 2026-10-31)", () => {
  // Le lien de la politique s'ouvre dans l'onglet de la page : le visiteur y revient par l'accueil
  it("opens the privacy policy in the same tab", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = render(createElement(SignInNote), locale);
      const link = html.match(/<a [^>]*>/)?.[0] ?? "";

      expect(link).toContain('href="/confidentialite"');
      expect(link).not.toContain("target");
      expect(link).not.toContain("rel=");
    }
  });
});

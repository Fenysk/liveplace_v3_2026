import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route } from "../../routes/confidentialite";
import { LocaleProvider } from "../locale/use-locale";
import { PrivacyPage } from "./privacy-page";

const titleFor = async (locale: "fr" | "en") => {
  const head = await Route.options.head?.({
    matches: [{ loaderData: { betaLabel: null, locale } }],
  } as never);
  return head?.meta?.find((tag) => tag && "title" in tag)?.title;
};

describe("la page Confidentialité dans les deux langues (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand le serveur rend la page, le titre de l'onglet est écrit dans la langue que la racine a rendue
  it("writes the title of the tab in the language the root rendered", async () => {
    expect(await titleFor("fr")).toBe("Confidentialité · LivePlace");
    expect(await titleFor("en")).toBe("Privacy · LivePlace");
  });

  // Le titre de la page suit la langue
  it("writes the title of the page in the language of the visitor", () => {
    expect(renderToStaticMarkup(createElement(PrivacyPage))).toContain("Politique de confidentialité");
    expect(
      renderToStaticMarkup(createElement(LocaleProvider, { initial: "en" }, createElement(PrivacyPage))),
    ).toContain("Privacy policy");
  });

  // Tant que le texte n'est pas écrit, la page le dit sur un ton léger, dans la langue du visiteur, sous le titre (React écrit l'apostrophe `&#x27;`)
  it("says the policy is not written yet, with a joke, in the language of the visitor, under the title", () => {
    const french = renderToStaticMarkup(createElement(PrivacyPage));
    const english = renderToStaticMarkup(
      createElement(LocaleProvider, { initial: "en" }, createElement(PrivacyPage)),
    );

    expect(french).toContain(
      "Notre politique de confidentialité est tellement confidentielle qu&#x27;on ne l&#x27;a pas encore écrite.",
    );
    expect(english).toContain("Our privacy policy is so private we haven&#x27;t even written it yet.");
    expect(french.indexOf("Politique de confidentialité")).toBeLessThan(french.indexOf("Notre politique"));
    expect(english).not.toContain("tellement");
  });
});

const inLocale = (locale: "fr" | "en"): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(PrivacyPage)));

describe("la page Confidentialité ramène à l'accueil (Écart §9.1, JOURNAL 2026-10-31)", () => {
  // Quand le visiteur arrive sur la page, « LivePlace » est un lien vers l'accueil, avant le titre, dans les deux langues
  it("writes LivePlace first, as a link to the home page, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);

      expect(html).toContain('<a class="lp-type-display lp-wordmark" href="/">LivePlace</a>');
      expect(html.indexOf("LivePlace</a>")).toBeLessThan(html.indexOf("<h1"));
      expect(html.match(/<a /g)).toHaveLength(1);
    }
  });

  // Le mot est du texte seul, et le serveur n'écrit aucun `style` : la CSP de production le bloquerait
  it("carries no shape next to the name and no inline style", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = inLocale(locale);

      expect(html).not.toMatch(/\sstyle=/);
      expect(html).not.toMatch(/<svg|<img/);
    }
  });

  // Le texte de la page ne change pas : le mot-symbole n'est pas traduit, c'est le nom
  it("keeps the words of the page as they were", () => {
    expect(inLocale("fr")).toContain("Politique de confidentialité");
    expect(inLocale("en")).toContain("Privacy policy");
    expect(inLocale("en")).toContain("so private we haven&#x27;t even written it yet.");
    expect(inLocale("fr")).not.toMatch(/Accueil|Retour/);
  });

  // Le mot garde sa place d'une page à l'autre : mêmes marges et même bloc de 1600 px que l'accueil (home.css)
  it("pins the name where the home page writes it: same margins, same widest block", () => {
    const privacyCss = readFileSync(join(import.meta.dirname, "privacy.css"), "utf8");
    const homeCss = readFileSync(join(import.meta.dirname, "..", "home", "home.css"), "utf8");
    const margin = "clamp(24px, 2.5vw, 40px)";

    expect(homeCss).toContain(`padding: ${margin};`);
    expect(privacyCss).toContain(`--lp-privacy-margin: ${margin};`);
    expect(privacyCss).toContain("--lp-privacy-margin: var(--space-4);");
    expect(homeCss).toContain("max-width: 1600px;");
    expect(privacyCss).toContain("1600px + 2 * var(--lp-privacy-margin)");
  });

  // La route lie cette feuille : sans elle, le mot-symbole ne serait pas posé en haut à gauche
  it("links its own stylesheet from the route", async () => {
    const head = await Route.options.head?.({
      matches: [{ loaderData: { betaLabel: null, locale: "fr" } }],
    } as never);

    expect(head?.links?.some((link) => link?.rel === "stylesheet")).toBe(true);
  });
});

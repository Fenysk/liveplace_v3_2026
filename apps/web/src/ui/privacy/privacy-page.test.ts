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
});

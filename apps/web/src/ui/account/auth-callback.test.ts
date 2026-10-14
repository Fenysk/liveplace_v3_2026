import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route } from "../../routes/auth/twitch.callback";
import { LocaleProvider } from "../locale/use-locale";
import { SignInExpired } from "./sign-in-expired";

// Le retour de Twitch sans le cookie de l'aller : `state` invalide, la page `/auth/expired` le dit et offre Se connecter (§10.1).
const handlers = Route.options.server?.handlers;
const get = typeof handlers === "object" ? handlers?.GET : undefined;

const refused = async (): Promise<Response> => {
  const answer = await get?.({
    request: new Request("http://liveplace.test/auth/twitch/callback?state=forged&code=abc"),
    context: { deps: { isSecure: false } },
  } as never);
  if (!(answer instanceof Response)) throw new Error("le retour de Twitch devait répondre");
  return answer;
};

const pageIn = (locale: "fr" | "en"): string =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale }, createElement(SignInExpired)));

describe("the answer of the Twitch callback to a forged state (Écart §14, JOURNAL 2026-10-13)", () => {
  // Quand le retour ne vient pas du navigateur qui est parti chez Twitch, le système l'envoie à la page expirée et efface le cookie de l'aller
  it("sends a forged state to the expired page, and clears the cookie of the way out", async () => {
    const answer = await refused();

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe("/auth/expired");
    expect(answer.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  // La page dit que la connexion a expiré dans la langue du visiteur, avec Se connecter qui repart chez Twitch
  it("says the sign-in expired in the language of the visitor, with a sign-in button", () => {
    const french = pageIn("fr");
    const english = pageIn("en");

    expect(french).toContain("La connexion à Twitch a expiré. Recommence.");
    expect(french).toContain('href="/auth/twitch"');
    expect(french).toContain("Se connecter avec Twitch");
    expect(english).toContain("The Twitch sign-in expired. Start again.");
    expect(english).toContain("Sign in with Twitch");
  });
});

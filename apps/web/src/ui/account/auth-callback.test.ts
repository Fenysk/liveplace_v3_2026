import { describe, expect, it } from "vitest";
import { Route } from "../../routes/auth/twitch.callback";

// Le retour de Twitch sans le cookie de l'aller : `state` invalide, une réponse en texte brut (§10.1).
const handlers = Route.options.server?.handlers;
const get = typeof handlers === "object" ? handlers?.GET : undefined;

const refused = async (headers: Record<string, string>): Promise<Response> => {
  const answer = await get?.({
    request: new Request("http://liveplace.test/auth/twitch/callback?state=forged&code=abc", { headers }),
    context: { deps: { isSecure: false } },
  } as never);
  if (!(answer instanceof Response)) throw new Error("le retour de Twitch devait répondre");
  return answer;
};

describe("the plain answer of the Twitch callback in the language of the visitor (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand le retour ne vient pas du navigateur qui est parti chez Twitch, le système refuse dans la langue du visiteur
  it("refuses a forged state in English for an English browser, and in French by default", async () => {
    const english = await refused({ "accept-language": "en-GB,en;q=0.8" });
    const french = await refused({});
    const cookieWins = await refused({ "accept-language": "en", cookie: "lp_locale=fr" });

    expect(english.status).toBe(400);
    expect(await english.text()).toBe("Sign-in refused: invalid state.");
    expect(await french.text()).toBe("Connexion refusée : state invalide.");
    expect(await cookieWins.text()).toBe("Connexion refusée : state invalide.");
  });
});

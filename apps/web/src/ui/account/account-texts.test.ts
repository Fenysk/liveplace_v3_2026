import { describe, expect, it } from "vitest";
import { ACCOUNT_TEXTS } from "./account-texts";

describe("the account sentences in both languages (Écart §14, JOURNAL 2026-10-07)", () => {
  // Le point des signalements dans le titre de la photo ou de Modération : le nombre déjà accordé, puis « en attente »
  it("says the pending reports in the title of the photo and of Moderation", () => {
    expect(ACCOUNT_TEXTS.fr.withPending("Mon compte", "2 signalements")).toBe(
      "Mon compte · 2 signalements en attente",
    );
    expect(ACCOUNT_TEXTS.en.withPending("My account", "2 reports")).toBe("My account · 2 reports pending");
  });

  // Quand la connexion échoue, ces deux phrases se lisent dans la langue du visiteur : la page expirée, puis la réponse brute
  it("says the two failures of the Twitch callback in each language", () => {
    expect(ACCOUNT_TEXTS.fr.signInRefused).toBe("La connexion à Twitch a expiré. Recommence.");
    expect(ACCOUNT_TEXTS.fr.signInFailed).toBe("La connexion Twitch a échoué. Réessaie dans un instant.");
    expect(ACCOUNT_TEXTS.en.signInRefused).toBe("The Twitch sign-in expired. Start again.");
    expect(ACCOUNT_TEXTS.en.signInFailed).toBe("Twitch sign-in failed. Try again in a moment.");
  });
});

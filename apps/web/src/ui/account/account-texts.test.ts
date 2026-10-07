import { describe, expect, it } from "vitest";
import { ACCOUNT_TEXTS } from "./account-texts";

describe("the account sentences in both languages (Écart §14, JOURNAL 2026-10-07)", () => {
  // Le point des signalements dans le titre de la photo : le nombre déjà accordé, puis « en attente »
  it("says the pending reports in the title of the photo", () => {
    expect(ACCOUNT_TEXTS.fr.myAccountPending("2 signalements")).toBe(
      "Mon compte · 2 signalements en attente",
    );
    expect(ACCOUNT_TEXTS.en.myAccountPending("2 reports")).toBe("My account · 2 reports pending");
  });

  // La route de retour de Twitch répond en texte brut : ces deux phrases se lisent dans la langue du visiteur
  it("says the two plain answers of the Twitch callback in each language", () => {
    expect(ACCOUNT_TEXTS.fr.signInRefused).toBe("Connexion refusée : state invalide.");
    expect(ACCOUNT_TEXTS.fr.signInFailed).toBe("La connexion Twitch a échoué. Réessaie dans un instant.");
    expect(ACCOUNT_TEXTS.en.signInRefused).toBe("Sign-in refused: invalid state.");
    expect(ACCOUNT_TEXTS.en.signInFailed).toBe("Twitch sign-in failed. Try again in a moment.");
  });
});

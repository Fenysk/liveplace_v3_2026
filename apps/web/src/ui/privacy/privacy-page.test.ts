import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrivacyPage } from "./privacy-page";

const page = renderToString(createElement(PrivacyPage));

describe("la page de confidentialité", () => {
  // La page rendue n'embarque ni script ni encart AdSense : on y lit la politique, rien ne s'y charge
  it("loads nothing from Google", () => {
    expect(page).not.toContain("adsbygoogle");
    expect(page).not.toContain("googlesyndication");
  });

  // La section Publicité porte de quoi changer d'avis : les deux boutons, présents dès le rendu serveur
  it("offers both buttons to change the ad choice", () => {
    expect(page).toContain("Accepter");
    expect(page).toContain("Refuser");
  });

  // Le serveur ne connaît pas le choix : la ligne qui le dit reste vide jusqu'à l'hydratation
  it("leaves the current choice empty until the browser has read it", () => {
    expect(page).not.toContain("Ton choix");
    expect(page).not.toContain("pas encore choisi");
  });

  // Les valeurs encore à décider restent des placeholders visibles, l'âge minimum compris
  it("keeps the undecided values as visible placeholders", () => {
    for (const placeholder of ["[LEGAL_ENTITY]", "[RETENTION_CONSENT]", "[AGE_MINIMUM]"])
      expect(page).toContain(placeholder);
    expect(page).not.toContain("15 ans");
  });

  // La date en tête est celle du déploiement ; le contact est renseigné
  it("states its update date and its contact", () => {
    expect(page).toContain("4 octobre 2026");
    expect(page).toContain("fenysk.pro@gmail.com");
  });
});

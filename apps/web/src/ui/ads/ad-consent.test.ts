import { describe, expect, it } from "vitest";
import { AD_CONSENT_KEY, adsStage, getAdConsent, writeAdConsent } from "./ad-consent";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const store = { ...initial };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
};

describe("ad consent", () => {
  // Sans choix enregistré, la pill de consentement s'affiche
  it("reads null when nothing is stored", () => {
    expect(getAdConsent(memoryStorage())).toBeNull();
  });

  // Accepter et refuser se relisent tels quels
  it("round-trips accepted and refused", () => {
    const storage = memoryStorage();
    writeAdConsent("accepted", storage);
    expect(getAdConsent(storage)).toBe("accepted");
    expect(storage.getItem(AD_CONSENT_KEY)).toBe("accepted");
    writeAdConsent("refused", storage);
    expect(getAdConsent(storage)).toBe("refused");
  });

  // Une valeur inconnue ne compte pas comme un choix
  it("ignores unknown values", () => {
    expect(getAdConsent(memoryStorage({ [AD_CONSENT_KEY]: "maybe" }))).toBeNull();
  });
});

describe("adsStage", () => {
  // Tant que le choix n'est pas lu (le serveur, l'hydratation), rien ne se montre
  it("shows nothing until the choice has been read", () => {
    expect(adsStage({ consent: null, isObs: false })).toBe("hidden");
  });

  // Sans choix, la pill de consentement ; refusé, rien ; accepté, la bande
  it("asks when nothing is chosen, hides when refused, shows the band when accepted", () => {
    expect(adsStage({ consent: "unset", isObs: false })).toBe("consent");
    expect(adsStage({ consent: "refused", isObs: false })).toBe("hidden");
    expect(adsStage({ consent: "accepted", isObs: false })).toBe("band");
  });

  // Dans OBS, jamais rien, quel que soit le choix : la page de jeu s'y hydrate un instant avant de basculer
  it("never shows anything in the OBS view", () => {
    for (const consent of [null, "unset", "refused", "accepted"] as const)
      expect(adsStage({ consent, isObs: true })).toBe("hidden");
  });
});

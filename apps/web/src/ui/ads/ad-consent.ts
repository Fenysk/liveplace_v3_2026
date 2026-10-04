// Choix pub AdSense : accepté / refusé, retenu dans le navigateur. Sans choix, la pill de consentement s'affiche.
// Rien ne se montre ni ne se charge avant la lecture du choix, ni dans la vue OBS.

export const AD_CONSENT_KEY = "liveplace:ad-consent";

export type AdConsent = "accepted" | "refused";

export function getAdConsent(storage?: Pick<Storage, "getItem"> | undefined): AdConsent | null {
  try {
    const value = storage?.getItem(AD_CONSENT_KEY);
    return value === "accepted" || value === "refused" ? value : null;
  } catch {
    return null;
  }
}

export function writeAdConsent(choice: AdConsent, storage: Pick<Storage, "setItem">): void {
  storage.setItem(AD_CONSENT_KEY, choice);
}

// `null` : pas encore lu (le serveur, l'hydratation). `"unset"` : lu, aucun choix.
export type AdConsentReading = AdConsent | "unset" | null;

export type AdsStage = "hidden" | "consent" | "band";

export function adsStage({ consent, isObs }: { consent: AdConsentReading; isObs: boolean }): AdsStage {
  if (isObs || consent === null || consent === "refused") return "hidden";
  return consent === "unset" ? "consent" : "band";
}

// Pubs + consentement sur le canvas navigateur : jamais en OBS (monté seulement depuis GamePage).

import { useIsObsView } from "../obs/obs-view";
import { AdBand } from "./ad-band";
import { adsStage } from "./ad-consent";
import { ConsentPill } from "./consent-pill";
import { useAdConsent } from "./use-ad-consent";

export const CanvasAds = () => {
  const { consent, accept, refuse } = useAdConsent();
  const stage = adsStage({ consent, isObs: useIsObsView() });
  if (stage === "consent") return <ConsentPill onAccept={accept} onRefuse={refuse} />;
  if (stage === "band") return <AdBand />;
  return null;
};

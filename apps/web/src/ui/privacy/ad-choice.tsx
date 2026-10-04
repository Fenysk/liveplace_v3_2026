// La section Publicité de la politique : le choix du moment, et de quoi en changer (CDC 2026, Publicité).

import { Heart } from "lucide-react";
import { useAdConsent } from "../ads/use-ad-consent";
import { Button } from "../design/button";

const CHOICE_SENTENCES = {
  accepted: "Ton choix : les publicités sont acceptées.",
  refused: "Ton choix : les publicités sont refusées.",
  unset: "Tu n'as pas encore choisi.",
};

export const AdChoice = () => {
  const { consent, accept, refuse } = useAdConsent();
  return (
    <div className="lp-privacy-choice">
      {/* Lu après l'hydratation : le serveur ne connaît pas le choix, sa ligne reste vide. */}
      <p className="lp-type-body" role="status">
        {consent && CHOICE_SENTENCES[consent]}
      </p>
      <div className="lp-privacy-choice-actions">
        <Button label="Refuser" isPressed={consent === "refused"} onPress={refuse} />
        <Button label="Accepter" icon={Heart} isPressed={consent === "accepted"} onPress={accept} />
      </div>
    </div>
  );
};

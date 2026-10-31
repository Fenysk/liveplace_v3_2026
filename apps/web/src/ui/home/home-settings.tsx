// Les réglages d'un visiteur sur l'accueil (Écart §14, JOURNAL 2026-10-22) : Soutenir LivePlace puis la langue et l'apparence, en haut
// à droite. Les deux choix de langue ne tiennent pas à côté du mot-symbole sur un téléphone : la langue y est un bouton (« FR ») qui
// passe à la suivante, et Soutenir LivePlace n'y garde que son cœur (CDC 2026, Soutenir LivePlace). Le serveur écrit les deux formes,
// home.css montre celle qui tient ; l'apparence est celle de la pill Compte.

import { AppearanceButton } from "../design/appearance-controls";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LocalePicker } from "../design/locale-controls";
import { SupportButton } from "../design/support";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { LOCALE_NAMES, nextLocale } from "../locale/locale";
import { useLocale, usePickLocale, useTexts } from "../locale/use-locale";

const LocaleCycleButton = () => {
  const locale = useLocale();
  const pick = usePickLocale();
  const t = useTexts(DESIGN_TEXTS);
  return (
    <Button
      variant="ghost"
      label={locale.toUpperCase()}
      title={t.localeTip(LOCALE_NAMES[locale])}
      onPress={() => pick(nextLocale(locale))}
    />
  );
};

export const HomeSettings = () => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <div className="lp-home-settings">
      <div className="lp-home-support lp-home-support--label">
        <SupportButton />
      </div>
      <div className="lp-home-support lp-home-support--icon">
        <SupportButton hasLabel={false} />
      </div>
      <div className="lp-home-locale lp-home-locale--choices">
        <LocalePicker />
      </div>
      <div className="lp-home-locale lp-home-locale--cycle">
        <LocaleCycleButton />
      </div>
      <AppearanceButton choice={appearanceChoice} onPick={pickAppearance} />
    </div>
  );
};

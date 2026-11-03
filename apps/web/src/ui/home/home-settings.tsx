// Les réglages d'un visiteur sur l'accueil (§9.9) : les Nouveautés, la langue et l'apparence, en haut à droite. Les deux
// choix de langue ne tiennent pas à côté du mot-symbole sur un téléphone : la langue y est un bouton (« FR ») qui passe à la suivante.
// Le serveur écrit les deux formes, home.css montre celle qui tient ; l'apparence est celle de la pill Compte. Les Nouveautés sont un
// vrai lien vers `/nouveautes`, avec un point tant que les lignes « pour tous » de la dernière publication ne sont pas lues ici.

import { Sparkles } from "lucide-react";
import { AppearanceButton } from "../design/appearance-controls";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LocalePicker } from "../design/locale-controls";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { LOCALE_NAMES, nextLocale } from "../locale/locale";
import { useLocale, usePickLocale, useTexts } from "../locale/use-locale";
import { audiencesOf } from "../release-notes/release-notes";
import { RELEASE_NOTES_TEXTS } from "../release-notes/release-notes-texts";
import { useHasUnreadReleases } from "../release-notes/use-release-notes";

const RELEASE_NOTES_PATH = "/nouveautes";

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

const ReleaseNotesLink = () => {
  const t = useTexts(RELEASE_NOTES_TEXTS);
  const hasUnread = useHasUnreadReleases(audiencesOf("viewer"));
  return (
    <Button variant="ghost" icon={Sparkles} title={t.title} href={RELEASE_NOTES_PATH} hasDot={hasUnread} />
  );
};

// `hasReleaseNotesLink` : faux sur `/nouveautes` elle-même.
export const HomeSettings = ({ hasReleaseNotesLink = true }: { hasReleaseNotesLink?: boolean }) => {
  const appearanceChoice = useAppearanceChoice();
  return (
    <div className="lp-home-settings">
      {hasReleaseNotesLink && <ReleaseNotesLink />}
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

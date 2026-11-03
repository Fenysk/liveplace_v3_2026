// Soutenir LivePlace sur l'accueil (CDC 2026, Soutenir LivePlace) : juste après le mot-symbole, à gauche, car il est à LivePlace ;
// les réglages du visiteur sont à droite. Le nom est écrit à côté : le bouton à texte dit « Soutenir ». Sur un téléphone, le cœur
// seul le remplace et garde le nom complet en titre. Le serveur écrit les deux formes, home.css montre celle qui tient. La fenêtre
// est unique et hors des deux formes : celle que le CSS cache ne doit jamais porter la fenêtre ouverte.

import { DESIGN_TEXTS } from "../design/design-texts";
import { SupportButton, useSupportWindow } from "../design/support";
import { useTexts } from "../locale/use-locale";

export const HomeSupport = () => {
  const t = useTexts(DESIGN_TEXTS);
  const { open, supportWindow } = useSupportWindow();
  return (
    <>
      <div className="lp-home-support lp-home-support--label">
        <SupportButton label={t.supportShort} onOpen={open} />
      </div>
      <div className="lp-home-support lp-home-support--icon">
        <SupportButton hasLabel={false} onOpen={open} />
      </div>
      {supportWindow}
    </>
  );
};

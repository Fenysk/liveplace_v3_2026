// Soutenir LivePlace (CDC 2026) : un don va à LivePlace, jamais à un streamer. Le bouton ne se rattache à aucun compte ni à aucune
// fresque, et n'entre dans aucune pill de compte ou de fresque ; il ouvre, à chaque clic et pour tous, une petite fenêtre qui dit à
// quoi sert le don. Le lien vers la page Ko-fi de LivePlace y est le bouton « Faire un don », dans un nouvel onglet.

import { Heart } from "lucide-react";
import { useState } from "react";
import { useTexts } from "../locale/use-locale";
import { Button } from "./button";
import { DESIGN_TEXTS } from "./design-texts";
import { Pill, type PillDock } from "./pill";
import { Avatar } from "./profile";
import { BadgeGlyph } from "./user-badge";
import { SmallWindow } from "./window";

// L'adresse de la page de dons, à un seul endroit.
const SUPPORT_URL = "https://ko-fi.com/fenysk";

// La signature de la fenêtre : le nom et la photo Twitch de Fenysk, sur le CDN que `img-src` autorise déjà (security-headers).
const SUPPORT_AUTHOR = "Fenysk";
const SUPPORT_PHOTO_URL =
  "https://static-cdn.jtvnw.net/jtv_user_pictures/ff66e718-fc35-4582-89f3-8038b65135d8-profile_image-300x300.png";

const DOCK: PillDock = "bl";

type SupportWindowProps = { isOpen: boolean; onClose: () => void };

// Fermer (Échap, la croix, la poignée) ou Faire un don ferment la fenêtre ; le lien part dans un nouvel onglet quand même.
export const SupportWindow = ({ isOpen, onClose }: SupportWindowProps) => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <SmallWindow
      isOpen={isOpen}
      title={t.supportLiveplace}
      onClose={onClose}
      actions={
        <>
          <Button label={t.close} kbd={t.escapeKey} onPress={onClose} />
          <Button
            label={t.supportDonate}
            icon={Heart}
            variant="support"
            href={SUPPORT_URL}
            isNewTab
            onPress={onClose}
          />
        </>
      }
    >
      <div className="lp-support-lead">
        <p className="lp-type-title">{t.supportFree}</p>
        <p className="lp-type-body lp-muted">{t.supportPays}</p>
        <ul className="lp-type-body">
          {t.supportReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="lp-support-signature">
        <Avatar displayName={SUPPORT_AUTHOR} avatarUrl={SUPPORT_PHOTO_URL} />
        <span className="lp-support-signature-text">
          <span className="lp-type-body">{SUPPORT_AUTHOR}</span>
          <span className="lp-type-body lp-muted">{t.supportSignature}</span>
        </span>
      </div>
      <p className="lp-type-caption lp-muted lp-support-note">
        {t.supportBadgeNote.before}
        <span aria-hidden="true">
          (
          <span className="lp-support-note-heart">
            <BadgeGlyph family="support" />
          </span>
          )
        </span>
        {t.supportBadgeNote.after}
      </p>
    </SmallWindow>
  );
};

// Un cœur et le texte ; sans libellé, le cœur seul, nommé par son titre (l'accueil sur un téléphone). Il ne sait qu'ouvrir.
// `label` remplace le texte seul (l'accueil, à côté du mot-symbole) ; le cœur seul garde toujours « Soutenir LivePlace ».
type SupportButtonProps = { hasLabel?: boolean; label?: string; onOpen: () => void };

export const SupportButton = ({ hasLabel = true, label, onOpen }: SupportButtonProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const opener = { icon: Heart, variant: "support", onPress: onOpen } as const;
  return hasLabel ? (
    <Button label={label ?? t.supportLiveplace} {...opener} />
  ) : (
    <Button title={t.supportLiveplace} {...opener} />
  );
};

// Une seule fenêtre par page, que chaque bouton ouvre par `open`. `supportWindow` se rend hors de tout conteneur que le CSS peut
// cacher : une fenêtre ouverte dont le conteneur passe en `display: none` (l'accueil change de bouton à 640 px) disparaît sans se
// fermer, et son `<dialog>` modal laisse la page inerte.
export const useSupportWindow = () => {
  const [isOpen, setIsOpen] = useState(false);
  return {
    open: () => setIsOpen(true),
    supportWindow: <SupportWindow isOpen={isOpen} onClose={() => setIsOpen(false)} />,
  };
};

// La pill Soutenir, en bas à gauche d'une fresque et de son archive, pour tous. Le CSS l'efface en Dessin et pendant un déplacement
// de la vue (support.css) ; sa place suit l'écran, jamais la pill Dessin. Sa fenêtre est à côté d'elle, jamais dedans.
export const SupportPill = ({ isDocked = true }: { isDocked?: boolean }) => {
  const { open, supportWindow } = useSupportWindow();
  return (
    <>
      <Pill dock={isDocked ? DOCK : undefined}>
        <SupportButton onOpen={open} />
      </Pill>
      {supportWindow}
    </>
  );
};

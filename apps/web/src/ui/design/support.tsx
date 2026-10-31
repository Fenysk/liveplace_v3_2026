// Soutenir LivePlace (CDC 2026) : un don va à LivePlace, jamais à un streamer. Le bouton ne se rattache à aucun compte ni à aucune
// fresque, et n'entre dans aucune pill de compte ou de fresque ; il ouvre la page Ko-fi de LivePlace dans un nouvel onglet.

import { Heart } from "lucide-react";
import { useTexts } from "../locale/use-locale";
import { Button } from "./button";
import { DESIGN_TEXTS } from "./design-texts";
import { Pill, type PillDock } from "./pill";

// L'adresse de la page de dons, à un seul endroit.
const SUPPORT_URL = "https://ko-fi.com/fenysk";

const DOCK: PillDock = "bl";

// Un cœur et le texte ; sans libellé, le cœur seul, nommé par son titre (l'accueil sur un téléphone).
export const SupportButton = ({ hasLabel = true }: { hasLabel?: boolean }) => {
  const t = useTexts(DESIGN_TEXTS);
  const link = { icon: Heart, variant: "support", href: SUPPORT_URL, isNewTab: true } as const;
  return hasLabel ? (
    <Button label={t.supportLiveplace} {...link} />
  ) : (
    <Button title={t.supportLiveplace} {...link} />
  );
};

// La pill Soutenir, en bas à gauche d'une fresque et de son archive, pour tous. Le CSS l'efface en Dessin et pendant un déplacement
// de la vue (support.css) ; sa place suit l'écran, jamais la pill Dessin.
export const SupportPill = ({ isDocked = true }: { isDocked?: boolean }) => (
  <Pill dock={isDocked ? DOCK : undefined}>
    <SupportButton />
  </Pill>
);

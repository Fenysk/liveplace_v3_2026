// La pill Thème (Écart §8.1, JOURNAL 2026-10-07), en haut au centre : le thème du canvas, montré à tous dès qu'il est
// rempli. Un petit texte discret au-dessus, le thème dessous, gros. Sur mobile, elle passe sous les pills du haut, le petit
// texte se réduit à « Thème » et le thème tient sur deux lignes (pill.css, theme-pill.css). Jamais cliquable.

import { Pill, type PillDock } from "./pill";
import { useShownWhileClosing } from "./window";

const DOCK: PillDock = "tc";

type ThemePillProps = {
  theme: string | undefined; // absent : pas de pill, ou elle part en fondu avec son dernier texte
  isDocked?: boolean;
};

export const ThemePill = ({ theme, isDocked = true }: ThemePillProps) => {
  const shown = useShownWhileClosing(theme || null);
  if (shown === null) return null;
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="title" isVisible={Boolean(theme)}>
      <p className="lp-theme">
        <span className="lp-theme-caption lp-type-caption lp-muted">
          {/* Les deux phrases sont dans la page : le CSS garde celle de l'écran, sans attendre React sur un téléphone. */}
          <span className="lp-theme-wide">Dessine sur le thème</span>
          <span className="lp-theme-narrow">Thème</span>
        </span>
        <span className="lp-theme-text lp-type-heading">{shown}</span>
      </p>
    </Pill>
  );
};

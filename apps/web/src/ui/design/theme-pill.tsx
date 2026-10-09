// La pill Thème (Écart §8.1, JOURNAL 2026-10-07), en haut au centre : le thème du canvas, montré à tous dès qu'il est
// rempli. Un petit texte discret au-dessus, le thème dessous, gros. Sur mobile, c'est une bande sous les pills du haut, sur
// leur largeur : « Thème » devant le thème, qui tient sur deux lignes ; en Dessin, elle monte à leur place (Écart §8.1, JOURNAL
// 2026-10-08, pill.css, theme-pill.css). Jamais cliquable.

import { useTexts } from "../locale/use-locale";
import { DESIGN_TEXTS } from "./design-texts";
import { Pill, type PillDock } from "./pill";
import { useShownWhileClosing } from "./window";

const DOCK: PillDock = "tc";

type ThemePillProps = {
  theme: string | undefined; // absent : pas de pill, ou elle part en fondu avec son dernier texte
  isDocked?: boolean;
};

export const ThemePill = ({ theme, isDocked = true }: ThemePillProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const shown = useShownWhileClosing(theme || null);
  if (shown === null) return null;
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="title" isVisible={Boolean(theme)}>
      <p className="lp-theme">
        {/* Au PC, il s'efface (display: contents) ; sur mobile, c'est le seul bloc du `line-clamp`, où le petit texte et le thème coulent à la suite. */}
        <span className="lp-theme-line">
          <span className="lp-theme-caption lp-type-caption lp-muted">
            {/* Les deux phrases sont dans la page : le CSS garde celle de l'écran, sans attendre React sur un téléphone. */}
            <span className="lp-theme-wide">{t.themeDraw}</span>
            <span className="lp-theme-narrow">{t.theme}</span>
          </span>
          <span className="lp-theme-text lp-type-heading">{shown}</span>
        </span>
      </p>
    </Pill>
  );
};

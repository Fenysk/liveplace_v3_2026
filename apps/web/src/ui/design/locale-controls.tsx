// Choisir la langue (Écart §14, JOURNAL 2026-10-07) : un bouton qui bascule (pill Compte), ou les langues côte à côte
// (Mon compte, /design). Comme le thème, mais la langue vit dans le contexte de la page, pas dans ces composants.

import { LOCALE_NAMES, LOCALES, type Locale, nextLocale } from "../locale/locale";
import { useLocale, usePickLocale, useTexts } from "../locale/use-locale";
import { blurAfterClick } from "./button";
import { DESIGN_TEXTS } from "./design-texts";
import { Segmented, type SegmentedOption } from "./segmented";

const LOCALE_OPTIONS: readonly SegmentedOption<Locale>[] = LOCALES.map((value) => ({
  value,
  label: LOCALE_NAMES[value],
}));

// La langue courante, en deux lettres ; le titre dit l'autre, vers laquelle le clic bascule.
export const LocaleButton = () => {
  const locale = useLocale();
  const pick = usePickLocale();
  const t = useTexts(DESIGN_TEXTS);
  const next = nextLocale(locale);
  return (
    <button
      type="button"
      className="lp-btn lp-btn--ghost lp-btn--icon"
      title={t.switchTo[next]}
      aria-label={t.switchTo[next]}
      onClick={blurAfterClick(() => pick(next))}
    >
      <span className="lp-type-numeric" aria-hidden="true">
        {locale.toUpperCase()}
      </span>
    </button>
  );
};

export const LocalePicker = () => {
  const locale = useLocale();
  const pick = usePickLocale();
  const t = useTexts(DESIGN_TEXTS);
  return <Segmented label={t.language} options={LOCALE_OPTIONS} value={locale} onSelect={pick} />;
};

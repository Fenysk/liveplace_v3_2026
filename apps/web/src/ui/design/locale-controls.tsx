// Choisir la langue (Écart §14, JOURNAL 2026-10-07) : les langues côte à côte, dans Mon compte et sur /design. Comme
// l'apparence, mais la langue vit dans le contexte de la page, pas dans ce composant.

import { LOCALE_NAMES, LOCALES, type Locale } from "../locale/locale";
import { useLocale, usePickLocale, useTexts } from "../locale/use-locale";
import { DESIGN_TEXTS } from "./design-texts";
import { Segmented, type SegmentedOption } from "./segmented";

const LOCALE_OPTIONS: readonly SegmentedOption<Locale>[] = LOCALES.map((value) => ({
  value,
  label: LOCALE_NAMES[value],
}));

export const LocalePicker = () => {
  const locale = useLocale();
  const pick = usePickLocale();
  const t = useTexts(DESIGN_TEXTS);
  return <Segmented label={t.language} options={LOCALE_OPTIONS} value={locale} onSelect={pick} />;
};

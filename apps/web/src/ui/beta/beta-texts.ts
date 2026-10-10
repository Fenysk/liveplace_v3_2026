// Le mot du bandeau d'une bêta (Écart §14, JOURNAL 2026-10-07).

import { defineTexts, localized } from "../locale/texts";

export const BETA_TEXTS = defineTexts({
  badge: localized({ fr: (label: string) => `BÊTA · ${label}`, en: (label) => `BETA · ${label}` }),
});

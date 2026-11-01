// Le mot du bandeau d'une bêta (§9.9).

import { defineTexts, localized } from "../locale/texts";

export const BETA_TEXTS = defineTexts({
  badge: localized({ fr: (label: string) => `BÊTA · ${label}`, en: (label) => `BETA · ${label}` }),
});

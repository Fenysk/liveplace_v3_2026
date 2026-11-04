// La date de la dernière mise à jour de la politique, en tête de la page. À changer à la mise en prod, et à chaque fois que la politique change.

import { INTL_TAGS, type Locale } from "../locale/locale";

export const PRIVACY_UPDATED_ON = "2026-11-04";

// « 4 novembre 2026 », « November 4, 2026 » : le jour est celui de la constante, sans fuseau (UTC), sinon il glisserait d'un jour.
export const formatPrivacyDate = (locale: Locale): string =>
  new Intl.DateTimeFormat(INTL_TAGS[locale], { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${PRIVACY_UPDATED_ON}T00:00:00Z`),
  );

// La page parle au serveur pour la langue (JOURNAL 2026-11-04) : `POST /auth/locale` retient le choix dans le cookie `HttpOnly`,
// `GET /auth/locale` dit celui qui est retenu. La page ne lit ni n'écrit plus `lp_locale`.

import { type Locale, toLocale } from "./locale";

const LOCALE_PATH = "/auth/locale";

// Retient le choix. Un échec ne casse pas la page : la langue tient pour elle seule, le cookie reste celui d'avant.
export async function saveLocale(locale: Locale, send: typeof fetch = fetch): Promise<void> {
  try {
    const response = await send(LOCALE_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    if (!response.ok) console.warn(`locale : le serveur a refusé la langue (${response.status})`);
  } catch (error) {
    console.warn("locale : choix non retenu, la langue tient pour cette page seulement", error);
  }
}

// La langue retenue par le serveur ; `undefined` sans cookie, ou sans réponse : la page garde sa langue.
export async function getSavedLocale(send: typeof fetch = fetch): Promise<Locale | undefined> {
  try {
    const response = await send(LOCALE_PATH, { credentials: "same-origin", cache: "no-store" });
    const reply: unknown = await response.json();
    return typeof reply === "object" &&
      reply !== null &&
      "locale" in reply &&
      typeof reply.locale === "string"
      ? toLocale(reply.locale)
      : undefined;
  } catch (error) {
    console.warn("locale : langue retenue illisible, la page garde la sienne", error);
    return undefined;
  }
}

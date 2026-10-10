import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  formatDateTime,
  formatNumber,
  isSingular,
  LOCALE_COOKIE,
  LOCALES,
  localeCookie,
  localeOfMatches,
  nextLocale,
  resolveLocale,
  resolveRequestLocale,
  toLocale,
} from "./locale";

const resolveFrom = (cookieHeader: string | undefined, preferenceHeader?: string) =>
  resolveLocale({ cookieHeader, preferenceHeader });

describe("la langue du premier affichage (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand le navigateur préfère l'anglais, le système doit rendre la page en anglais
  it("takes English from a browser that prefers English", () => {
    expect(resolveFrom(undefined, "en-US,en;q=0.9")).toBe("en");
  });

  // Quand la première langue préférée est inconnue, le système doit prendre la première connue de la liste
  it("skips the languages it does not know and takes the first one it knows", () => {
    expect(resolveFrom(undefined, "de-DE,de;q=0.9,en;q=0.8")).toBe("en");
    expect(resolveFrom(undefined, "es,fr;q=0.5")).toBe("fr");
  });

  // Si aucune langue préférée n'est connue, alors le système doit rendre le français
  it("falls back to French when it knows none of the preferred languages", () => {
    expect(resolveFrom(undefined, "de-DE,de;q=0.9")).toBe("fr");
    expect(resolveFrom(undefined, "*")).toBe("fr");
  });

  // Si l'en-tête est absent ou vide, alors le système doit rendre le français
  it("falls back to French when there is no header at all", () => {
    expect(resolveFrom(undefined)).toBe("fr");
    expect(resolveFrom(undefined, "")).toBe("fr");
    expect(resolveFrom("", undefined)).toBe("fr");
  });

  // Les poids q font l'ordre : une langue moins pondérée passe après, même écrite avant
  it("orders the preferred languages by their q weight, not by their place in the header", () => {
    expect(resolveFrom(undefined, "fr;q=0.4,en;q=0.9")).toBe("en");
    expect(resolveFrom(undefined, "en;q=0.4,fr;q=0.9")).toBe("fr");
    expect(resolveFrom(undefined, "fr,en")).toBe("fr");
    expect(resolveFrom(undefined, "en,fr")).toBe("en");
  });

  // La région est ignorée, et q=0 veut dire « jamais cette langue »
  it("ignores the region, and a language weighted 0 is not wanted", () => {
    expect(resolveFrom(undefined, "en-GB")).toBe("en");
    expect(resolveFrom(undefined, "FR-ca")).toBe("fr");
    expect(resolveFrom(undefined, "en;q=0,fr;q=0.1")).toBe("fr");
    expect(resolveFrom(undefined, "en;q=0")).toBe("fr");
  });

  // Quand le cookie nomme une langue connue, alors il gagne sur l'en-tête, quel qu'il soit
  it("lets the cookie win over the header when it names a known language", () => {
    expect(resolveFrom(`${LOCALE_COOKIE}=en`, "fr-FR,fr;q=0.9")).toBe("en");
    expect(resolveFrom(`${LOCALE_COOKIE}=fr`, "en-US")).toBe("fr");
    expect(resolveFrom(`lp_session=abc; ${LOCALE_COOKIE}=en; theme=dark`, "fr")).toBe("en");
  });

  // Si le cookie est invalide, alors le système doit l'ignorer et lire l'en-tête
  it("ignores a cookie that is not a known language", () => {
    expect(resolveFrom(`${LOCALE_COOKIE}=de`, "en-US")).toBe("en");
    expect(resolveFrom(`${LOCALE_COOKIE}=`, "en-US")).toBe("en");
    expect(resolveFrom(`${LOCALE_COOKIE}=EN`, "en-US")).toBe("en");
    expect(resolveFrom(`other_${LOCALE_COOKIE}=en`, "fr")).toBe("fr");
  });
});

describe("la langue d'une requête et d'une page déjà rendue (Écart §14, JOURNAL 2026-10-07)", () => {
  // Une route serveur en texte brut lit les mêmes en-têtes que la page
  it("reads the cookie and Accept-Language of a request like the page does", () => {
    const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

    expect(resolveRequestLocale(request({ "accept-language": "en-GB,en;q=0.8" }))).toBe("en");
    expect(resolveRequestLocale(request({ "accept-language": "en", cookie: "lp_locale=fr" }))).toBe("fr");
    expect(resolveRequestLocale(request({}))).toBe("fr");
  });

  // Le titre de l'onglet, écrit par le serveur, suit la langue que la racine a rendue
  it("finds the language the root rendered among the matches of a route", () => {
    expect(
      localeOfMatches([{ loaderData: { betaLabel: null, locale: "en" } }, { loaderData: undefined }]),
    ).toBe("en");
    expect(localeOfMatches([{ loaderData: undefined }, { loaderData: { locale: "fr" } }])).toBe("fr");
    expect(localeOfMatches([{ loaderData: { locale: "de" } }, { loaderData: "en" }, {}])).toBe("fr");
    expect(localeOfMatches([])).toBe("fr");
  });

  // La date et l'heure en toutes lettres suivent la langue
  it("writes a date and its time the way each language does", () => {
    const timestamp = Date.UTC(2026, 9, 12, 12, 30);

    expect(formatDateTime(timestamp, "fr")).toBe(
      new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(timestamp),
    );
    expect(formatDateTime(timestamp, "en")).toMatch(/^October 12, 2026 at \d{1,2}:30\s?(AM|PM)$/);
  });
});

describe("le choix de la langue retenu dans le navigateur (Écart §14, JOURNAL 2026-10-07)", () => {
  // Le cookie dure un an, couvre tout le site, ne part pas d'un autre site, et reste lisible par la page
  it("writes a cookie of one year for the whole site, SameSite=Lax, that the page can read", () => {
    const cookie = localeCookie("en", false);

    expect(cookie).toBe("lp_locale=en; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(cookie).not.toContain("HttpOnly");
  });

  // En https, le cookie est Secure
  it("adds Secure over https", () => {
    expect(localeCookie("fr", true)).toBe("lp_locale=fr; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  // Le cookie écrit se relit : la page suivante, rendue par le serveur, a la même langue
  it("writes a cookie that the server resolves back to the same language", () => {
    for (const locale of LOCALES) {
      const written = localeCookie(locale, false).split(";")[0];
      expect(resolveFrom(written, "de")).toBe(locale);
    }
  });

  // Une langue inconnue n'est pas une langue
  it("knows only the languages of the list", () => {
    expect(toLocale("fr")).toBe("fr");
    expect(toLocale("en")).toBe("en");
    expect(toLocale("de")).toBeUndefined();
    expect(toLocale(undefined)).toBeUndefined();
    expect(DEFAULT_LOCALE).toBe("fr");
  });

  // Le bouton bascule vers l'autre langue, et revient au bout du tour
  it("switches to the other language, and comes back after a full turn", () => {
    expect(nextLocale("fr")).toBe("en");
    expect(nextLocale("en")).toBe("fr");
  });
});

describe("les nombres et les pluriels de chaque langue (Écart §14, JOURNAL 2026-10-07)", () => {
  // Un nombre s'écrit comme la langue le veut : l'espace insécable en français, la virgule en anglais
  it("writes a number the way each language does", () => {
    expect(formatNumber(1204, "fr")).toBe((1204).toLocaleString("fr-FR"));
    expect(formatNumber(1204, "en")).toBe("1,204");
    expect(formatNumber(12, "en")).toBe("12");
  });

  // En français, zéro et un sont au singulier ; en anglais, un seul l'est
  it("treats zero and one as singular in French, and only one in English", () => {
    expect([0, 1, 2, 5].map((count) => isSingular(count, "fr"))).toEqual([true, true, false, false]);
    expect([0, 1, 2, 5].map((count) => isSingular(count, "en"))).toEqual([false, true, false, false]);
  });
});

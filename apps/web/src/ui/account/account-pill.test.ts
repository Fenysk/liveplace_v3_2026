import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountPill, type AccountPillProps } from "./account-pill";

const doNothing = (): void => undefined;

const render = (props: Partial<AccountPillProps> = {}): string =>
  renderToStaticMarkup(
    createElement(AccountPill, {
      identity: { kind: "signedIn", user: { displayName: "Kalyss", login: "kalyss" } },
      signInHref: "#",
      themeChoice: "auto",
      onPickTheme: doNothing,
      onOpenAccount: doNothing,
      ...props,
    }),
  );

const positionOf = (markup: string, title: string): number => markup.indexOf(`title="${title}"`);

describe("pill Compte", () => {
  // Quand le streamer est sur son canvas, la pill Compte montre Réglages, puis sa photo, puis le thème et la langue
  it("porte Réglages avant la photo, et le thème et la langue après, pour le streamer sur son canvas", () => {
    const markup = render({ onOpenSettings: doNothing });
    const settings = positionOf(markup, "Réglages");
    const account = positionOf(markup, "Mon compte");
    const theme = positionOf(markup, "Thème : Auto");
    const locale = positionOf(markup, "Passer en anglais");
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(account).toBeGreaterThan(settings);
    expect(theme).toBeGreaterThan(account);
    expect(locale).toBeGreaterThan(theme);
  });

  // Si ce n'est pas le streamer sur son canvas, alors la pill Compte n'a pas de Réglages
  it("n'a pas de Réglages pour les autres", () => {
    expect(render()).not.toContain("Réglages");
  });

  // Tant que le streamer attend la réponse du gateway, la pill est masquée et inerte, puis visible sans elle
  it("is hidden and inert only while it is told so", () => {
    expect(render({ isVisible: false })).toContain("is-hidden");
    expect(render({ isVisible: false })).toContain("inert");
    expect(render()).not.toContain("is-hidden");
  });

  // Tant que des signalements attendent, le point reste sur sa photo, avec Réglages à côté
  it("garde le point des signalements à côté de Réglages", () => {
    expect(render({ onOpenSettings: doNothing, pendingReports: 2 })).toContain("lp-avatar-dot");
  });

  // Si le compte connecté est le développeur, alors la pill Compte porte le bouton Développeur, avant Réglages
  // (écart §10.3, JOURNAL 2026-10-06)
  it("porte le bouton Développeur pour le développeur seul, avant Réglages", () => {
    const markup = render({ onOpenDeveloper: doNothing, onOpenSettings: doNothing });
    expect(positionOf(markup, "Développeur")).toBeGreaterThanOrEqual(0);
    expect(positionOf(markup, "Réglages")).toBeGreaterThan(positionOf(markup, "Développeur"));
    expect(render()).not.toContain("Développeur");
  });
});

// L'ordre des contrôles, de gauche à droite, tel que le HTML les écrit (Écart §14, JOURNAL 2026-10-07).
const SIGN_IN = "Se connecter avec Twitch";
const ALL_TITLES = ["Développeur", "Réglages", "Thème : Auto", "Passer en anglais", "Mon compte", SIGN_IN];

const orderOf = (markup: string): string[] =>
  ALL_TITLES.map((title) => ({ title, at: positionOf(markup, title) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ title }) => title);

describe("la disposition de la pill Compte (Écart §14, JOURNAL 2026-10-07)", () => {
  // Avec Développeur et Réglages à gauche de la photo, le thème et la langue passent à droite de la photo
  it("puts the theme and the language right of the photo when icons stand left of it", () => {
    expect(orderOf(render({ onOpenDeveloper: doNothing, onOpenSettings: doNothing }))).toEqual([
      "Développeur",
      "Réglages",
      "Mon compte",
      "Thème : Auto",
      "Passer en anglais",
    ]);
    expect(orderOf(render({ onOpenSettings: doNothing }))).toEqual([
      "Réglages",
      "Mon compte",
      "Thème : Auto",
      "Passer en anglais",
    ]);
    expect(orderOf(render({ onOpenDeveloper: doNothing }))).toEqual([
      "Développeur",
      "Mon compte",
      "Thème : Auto",
      "Passer en anglais",
    ]);
  });

  // Un joueur connecté sans ces icônes : le thème, la langue, puis la photo
  it("puts the theme, the language, then the photo for a signed-in player without those icons", () => {
    expect(orderOf(render())).toEqual(["Thème : Auto", "Passer en anglais", "Mon compte"]);
  });

  // Un invité : le thème, la langue, puis Se connecter, sur PC comme sur mobile
  it("puts the theme, the language, then Se connecter for a guest, on desktop and on mobile", () => {
    const guest = { identity: { kind: "guest" } } as const;

    expect(orderOf(render(guest))).toEqual(["Thème : Auto", "Passer en anglais", SIGN_IN]);
    expect(orderOf(render({ ...guest, isCompact: true }))).toEqual([
      "Thème : Auto",
      "Passer en anglais",
      SIGN_IN,
    ]);
  });

  // Tant que le gateway n'a pas répondu : le thème et la langue seuls
  it("shows the theme and the language alone while the identity is unknown", () => {
    expect(orderOf(render({ identity: { kind: "unknown" } }))).toEqual(["Thème : Auto", "Passer en anglais"]);
  });

  // Le bouton de langue montre la langue courante, et son titre dit l'action
  it("shows the current language on the button, its title saying the action", () => {
    const markup = render();

    expect(markup).toContain(">FR</span>");
    expect(markup).toContain('aria-label="Passer en anglais"');
  });
});

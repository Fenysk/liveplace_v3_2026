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
      appearanceChoice: "auto",
      onPickAppearance: doNothing,
      onOpenAccount: doNothing,
      ...props,
    }),
  );

const positionOf = (markup: string, title: string): number => markup.indexOf(`title="${title}"`);

describe("pill Compte", () => {
  // Quand le streamer est sur son canvas, la pill Compte montre Réglages, puis sa photo, puis l'apparence
  it("porte Réglages avant la photo, et l'apparence après, sans bouton de langue, pour le streamer sur son canvas", () => {
    const markup = render({ onOpenSettings: doNothing });
    const settings = positionOf(markup, "Réglages");
    const appearance = positionOf(markup, "Apparence : Auto");
    const account = positionOf(markup, "Mon compte");
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(account).toBeGreaterThan(settings);
    expect(appearance).toBeGreaterThan(account);
    expect(markup).not.toContain("Passer en anglais");
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

  // Si le compte modère sans être le streamer, alors la pill Compte porte Modération à la place de Réglages
  it("gives a moderator a Modération button in place of Réglages", () => {
    const markup = render({ onOpenModeration: doNothing });
    const moderation = positionOf(markup, "Modération");
    expect(moderation).toBeGreaterThanOrEqual(0);
    expect(positionOf(markup, "Apparence : Auto")).toBeGreaterThan(moderation);
    expect(markup).not.toContain("Réglages");
    expect(render()).not.toContain("Modération");
    const withDeveloper = render({ onOpenDeveloper: doNothing, onOpenModeration: doNothing });
    expect(positionOf(withDeveloper, "Modération")).toBeGreaterThan(positionOf(withDeveloper, "Développeur"));
  });

  // Tant qu'aucun signalement n'attend, alors le modérateur n'a aucun point
  it("shows no dot to a moderator while no report waits", () => {
    expect(render({ onOpenModeration: doNothing })).not.toContain("lp-avatar-dot");
  });

  // Tant que des signalements attendent, le point passe de la photo du modérateur à son bouton Modération
  it("moves the dot from the moderator's photo to the Modération button", () => {
    const markup = render({ onOpenModeration: doNothing, pendingReports: 2 });
    const moderation = positionOf(markup, "Modération · 2 signalements en attente");
    const dot = markup.indexOf("lp-avatar-dot");
    expect(moderation).toBeGreaterThanOrEqual(0);
    expect(dot).toBeGreaterThan(moderation);
    expect(dot).toBeLessThan(positionOf(markup, "Apparence : Auto"));
    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(positionOf(markup, "Mon compte")).toBeGreaterThanOrEqual(0);
    expect(markup).not.toContain("Mon compte ·");
  });

  // Tant que des signalements attendent, le streamer garde le point sur sa photo, qui le dit
  it("keeps the streamer's dot on the photo, with no Modération button", () => {
    const markup = render({ onOpenSettings: doNothing, pendingReports: 2 });
    expect(positionOf(markup, "Apparence : Auto")).toBeGreaterThan(
      positionOf(markup, "Mon compte · 2 signalements en attente"),
    );
    expect(markup.indexOf("lp-avatar-dot")).toBeLessThan(positionOf(markup, "Apparence : Auto"));
    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(markup).not.toContain("Modération");
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
const ALL_TITLES = ["Développeur", "Réglages", "Modération", "Apparence : Auto", "Mon compte", SIGN_IN];

const orderOf = (markup: string): string[] =>
  ALL_TITLES.map((title) => ({ title, at: positionOf(markup, title) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ title }) => title);

describe("la disposition de la pill Compte (Écart §14, JOURNAL 2026-10-07)", () => {
  // Avec Développeur, Réglages ou Modération à gauche de la photo, l'apparence passe à droite de la photo
  it("puts the appearance right of the photo when icons stand left of it", () => {
    expect(orderOf(render({ onOpenDeveloper: doNothing, onOpenSettings: doNothing }))).toEqual([
      "Développeur",
      "Réglages",
      "Mon compte",
      "Apparence : Auto",
    ]);
    expect(orderOf(render({ onOpenSettings: doNothing }))).toEqual([
      "Réglages",
      "Mon compte",
      "Apparence : Auto",
    ]);
    expect(orderOf(render({ onOpenDeveloper: doNothing }))).toEqual([
      "Développeur",
      "Mon compte",
      "Apparence : Auto",
    ]);
    expect(orderOf(render({ onOpenModeration: doNothing }))).toEqual([
      "Modération",
      "Mon compte",
      "Apparence : Auto",
    ]);
    expect(orderOf(render({ onOpenDeveloper: doNothing, onOpenModeration: doNothing }))).toEqual([
      "Développeur",
      "Modération",
      "Mon compte",
      "Apparence : Auto",
    ]);
  });

  // Un joueur connecté sans ces icônes : l'apparence, puis la photo
  it("puts the appearance, then the photo for a signed-in player without those icons", () => {
    expect(orderOf(render())).toEqual(["Apparence : Auto", "Mon compte"]);
  });

  // Un invité : l'apparence, puis Se connecter, sur PC comme sur mobile
  it("puts the appearance, then Se connecter for a guest, on desktop and on mobile", () => {
    const guest = { identity: { kind: "guest" } } as const;

    expect(orderOf(render(guest))).toEqual(["Apparence : Auto", SIGN_IN]);
    expect(orderOf(render({ ...guest, isCompact: true }))).toEqual(["Apparence : Auto", SIGN_IN]);
  });

  // Tant que le gateway n'a pas répondu : l'apparence seule
  it("shows the appearance alone while the identity is unknown", () => {
    expect(orderOf(render({ identity: { kind: "unknown" } }))).toEqual(["Apparence : Auto"]);
  });

  // La langue se choisit dans Mon compte : aucun bouton de langue dans la pill, quel que soit le compte
  it("has no language button, whoever the account is", () => {
    const markup = render();

    expect(markup).not.toContain(">FR</span>");
    expect(markup).not.toContain('aria-label="Passer en anglais"');
    expect(render({ identity: { kind: "guest" } })).not.toContain("Passer en anglais");
    expect(render({ onOpenSettings: doNothing, onOpenDeveloper: doNothing })).not.toContain(">FR</span>");
  });
});

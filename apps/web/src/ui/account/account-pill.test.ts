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
  // Quand le streamer est sur son canvas, la pill Compte montre Réglages, puis le thème, puis sa photo
  it("porte Réglages avant le thème et la photo pour le streamer sur son canvas", () => {
    const markup = render({ onOpenSettings: doNothing });
    const settings = positionOf(markup, "Réglages");
    const theme = positionOf(markup, "Thème : Auto");
    const account = positionOf(markup, "Mon compte");
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(theme).toBeGreaterThan(settings);
    expect(account).toBeGreaterThan(theme);
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
    expect(positionOf(markup, "Thème : Auto")).toBeGreaterThan(moderation);
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
    expect(dot).toBeLessThan(positionOf(markup, "Thème : Auto"));
    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(positionOf(markup, "Mon compte")).toBeGreaterThanOrEqual(0);
    expect(markup).not.toContain("Mon compte ·");
  });

  // Tant que des signalements attendent, le streamer garde le point sur sa photo, qui le dit
  it("keeps the streamer's dot on the photo, with no Modération button", () => {
    const markup = render({ onOpenSettings: doNothing, pendingReports: 2 });
    expect(positionOf(markup, "Mon compte · 2 signalements en attente")).toBeGreaterThan(
      positionOf(markup, "Thème : Auto"),
    );
    expect(markup.indexOf("lp-avatar-dot")).toBeGreaterThan(positionOf(markup, "Thème : Auto"));
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

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
});

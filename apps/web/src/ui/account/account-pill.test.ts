import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  // Quand le streamer est sur son canvas, la pill Compte montre Réglages, puis l'apparence, puis sa photo
  it("porte Réglages avant l'apparence et la photo pour le streamer sur son canvas", () => {
    const markup = render({ onOpenSettings: doNothing });
    const settings = positionOf(markup, "Réglages");
    const appearance = positionOf(markup, "Apparence : Auto");
    const account = positionOf(markup, "Mon compte");
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(appearance).toBeGreaterThan(settings);
    expect(account).toBeGreaterThan(appearance);
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
    expect(positionOf(markup, "Mon compte · 2 signalements en attente")).toBeGreaterThan(
      positionOf(markup, "Apparence : Auto"),
    );
    expect(markup.indexOf("lp-avatar-dot")).toBeGreaterThan(positionOf(markup, "Apparence : Auto"));
    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(markup).not.toContain("Modération");
  });

  // Sur mobile (Écart §8.1, JOURNAL 2026-10-08), l'apparence quitte la pill : elle est dans Mon compte
  it("has no appearance button on a compact screen, and keeps the photo", () => {
    const markup = render({ isCompact: true });
    expect(markup).not.toContain("Apparence");
    expect(positionOf(markup, "Mon compte")).toBeGreaterThanOrEqual(0);
    expect(markup).not.toContain("is-hidden");
  });

  // Sur mobile, chaque rôle garde ses boutons, sans l'apparence : Réglages, Modération, Développeur, puis la photo
  it("keeps the role buttons of the owner, the moderator and the developer on a compact screen", () => {
    const owner = render({ isCompact: true, onOpenSettings: doNothing });
    expect(positionOf(owner, "Mon compte")).toBeGreaterThan(positionOf(owner, "Réglages"));
    expect(owner).not.toContain("Apparence");
    const moderator = render({ isCompact: true, onOpenModeration: doNothing });
    expect(positionOf(moderator, "Mon compte")).toBeGreaterThan(positionOf(moderator, "Modération"));
    expect(moderator).not.toContain("Apparence");
    const developer = render({ isCompact: true, onOpenDeveloper: doNothing, onOpenSettings: doNothing });
    expect(positionOf(developer, "Réglages")).toBeGreaterThan(positionOf(developer, "Développeur"));
    expect(developer).not.toContain("Apparence");
  });

  // Sur mobile, les pastilles de signalements restent où elles sont : sur Modération, ou sur la photo
  it("keeps the report dots where they are on a compact screen", () => {
    const moderator = render({ isCompact: true, onOpenModeration: doNothing, pendingReports: 2 });
    expect(positionOf(moderator, "Modération · 2 signalements en attente")).toBeGreaterThanOrEqual(0);
    expect(moderator.match(/lp-avatar-dot/g)).toHaveLength(1);
    const owner = render({ isCompact: true, onOpenSettings: doNothing, pendingReports: 2 });
    expect(positionOf(owner, "Mon compte · 2 signalements en attente")).toBeGreaterThanOrEqual(0);
    expect(owner.match(/lp-avatar-dot/g)).toHaveLength(1);
  });

  // Sur mobile, un invité n'a plus ni Se connecter (la barre du bas le dit) ni l'apparence : la pill est masquée et inerte
  it("hides the pill of a guest on a compact screen, with neither Se connecter nor appearance", () => {
    const markup = render({ identity: { kind: "guest" }, isCompact: true });
    expect(markup).toContain("is-hidden");
    expect(markup).toContain("inert");
    expect(markup).not.toContain("Se connecter");
    expect(markup).not.toContain("Apparence");
  });

  // Tant que le gateway n'a pas répondu, la pill reste masquée sur mobile : rien n'y paraît pour être retiré ensuite
  it("keeps the pill hidden and empty on a compact screen until the gateway answers", () => {
    const markup = render({ identity: { kind: "unknown" }, isCompact: true });
    expect(markup).toContain("is-hidden");
    expect(markup).not.toContain("Apparence");
    expect(markup).not.toContain("<button");
  });

  // Sans barre du bas (la page d'une archive), l'invité sur mobile garde Se connecter dans la pill, avec son libellé
  it("keeps the guest's Se connecter, with its label, on a compact screen without a bottom bar", () => {
    const markup = render({ identity: { kind: "guest" }, isCompact: true, hasBottomBar: false });
    expect(markup).toContain("Se connecter</span>");
    expect(markup).not.toContain("is-hidden");
    expect(markup).not.toContain("Apparence");
  });

  // Sans barre du bas, ce qui n'est pas un invité ne change pas : la pill reste masquée avant le gateway, la photo reste seule
  it("changes nothing else without a bottom bar: hidden until the gateway answers, the photo alone for a viewer", () => {
    const unknown = render({ identity: { kind: "unknown" }, isCompact: true, hasBottomBar: false });
    expect(unknown).toContain("is-hidden");
    expect(unknown).not.toContain("<button");
    const viewer = render({ isCompact: true, hasBottomBar: false });
    expect(viewer).not.toContain("Se connecter");
    expect(viewer).not.toContain("Apparence");
    expect(viewer).not.toContain("is-hidden");
  });

  // La page du jeu a sa barre du bas (par défaut), celle d'une archive non : c'est la page qui le dit
  it("is told by the archive page, and by it alone, that there is no bottom bar", () => {
    const read = (...path: string[]) => readFileSync(join(import.meta.dirname, "..", ...path), "utf8");

    expect(read("archive", "archive-page.tsx")).toContain("hasBottomBar={false}");
    expect(read("..", "routes", "$login.tsx")).not.toContain("hasBottomBar");
  });

  // Au PC, rien ne change : l'invité garde Se connecter et l'apparence, et la pill reste visible
  it("keeps the guest's Se connecter and appearance on a PC", () => {
    const markup = render({ identity: { kind: "guest" } });
    expect(positionOf(markup, "Se connecter avec Twitch")).toBeGreaterThan(
      positionOf(markup, "Apparence : Auto"),
    );
    expect(markup).toContain("Se connecter</span>");
    expect(markup).not.toContain("is-hidden");
    const unknown = render({ identity: { kind: "unknown" } });
    expect(unknown).toContain("Apparence : Auto");
    expect(unknown).not.toContain("is-hidden");
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

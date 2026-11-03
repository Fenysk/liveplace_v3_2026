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

const SIGN_IN = "Se connecter";

// Un contrôle se repère à son `title`. Se connecter n'en a pas (§9.12) : son nom est son texte visible.
const positionOf = (markup: string, name: string): number =>
  markup.indexOf(name === SIGN_IN ? `>${SIGN_IN}</span>` : `title="${name}"`);

describe("pill Compte", () => {
  // Quand le streamer est sur son canvas, la pill Compte montre Réglages, puis sa photo, puis l'apparence
  it("porte Réglages avant la photo, et l'apparence après, sans bouton de langue, pour le streamer sur son canvas", () => {
    const markup = render({ onOpenSettings: doNothing });
    const settings = positionOf(markup, "Réglages");
    const appearance = positionOf(markup, "Apparence\u00a0: Auto");
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
    expect(positionOf(markup, "Apparence\u00a0: Auto")).toBeGreaterThan(moderation);
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
    expect(dot).toBeLessThan(positionOf(markup, "Apparence\u00a0: Auto"));
    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(positionOf(markup, "Mon compte")).toBeGreaterThanOrEqual(0);
    expect(markup).not.toContain("Mon compte ·");
  });

  // Tant que des signalements attendent, le streamer garde le point sur sa photo, qui le dit
  it("keeps the streamer's dot on the photo, with no Modération button", () => {
    const markup = render({ onOpenSettings: doNothing, pendingReports: 2 });
    expect(positionOf(markup, "Apparence\u00a0: Auto")).toBeGreaterThan(
      positionOf(markup, "Mon compte · 2 signalements en attente"),
    );
    expect(markup.indexOf("lp-avatar-dot")).toBeLessThan(positionOf(markup, "Apparence\u00a0: Auto"));
    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(markup).not.toContain("Modération");
  });

  // Sur mobile (§9.7), l'apparence quitte la pill : elle est dans Mon compte
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
    expect(positionOf(markup, SIGN_IN)).toBeGreaterThan(positionOf(markup, "Apparence\u00a0: Auto"));
    expect(markup).toContain("Se connecter</span>");
    expect(markup).not.toContain("Se connecter avec Twitch");
    expect(markup).not.toContain("is-hidden");
    const unknown = render({ identity: { kind: "unknown" } });
    expect(unknown).toContain("Apparence\u00a0: Auto");
    expect(unknown).not.toContain("is-hidden");
  });

  // Si le compte connecté est le développeur, alors la pill Compte porte le bouton Développeur, avant Réglages
  // (§10.3)
  it("porte le bouton Développeur pour le développeur seul, avant Réglages", () => {
    const markup = render({ onOpenDeveloper: doNothing, onOpenSettings: doNothing });
    expect(positionOf(markup, "Développeur")).toBeGreaterThanOrEqual(0);
    expect(positionOf(markup, "Réglages")).toBeGreaterThan(positionOf(markup, "Développeur"));
    expect(render()).not.toContain("Développeur");
  });
});

// L'ordre des contrôles, de gauche à droite, tel que le HTML les écrit (§9.9).
const ALL_TITLES = ["Développeur", "Réglages", "Modération", "Apparence\u00a0: Auto", "Mon compte", SIGN_IN];

const orderOf = (markup: string): string[] =>
  ALL_TITLES.map((title) => ({ title, at: positionOf(markup, title) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ title }) => title);

describe("la disposition de la pill Compte (§9.9)", () => {
  // Avec Développeur, Réglages ou Modération à gauche de la photo, l'apparence passe à droite de la photo
  it("puts the appearance right of the photo when icons stand left of it", () => {
    expect(orderOf(render({ onOpenDeveloper: doNothing, onOpenSettings: doNothing }))).toEqual([
      "Développeur",
      "Réglages",
      "Mon compte",
      "Apparence\u00a0: Auto",
    ]);
    expect(orderOf(render({ onOpenSettings: doNothing }))).toEqual([
      "Réglages",
      "Mon compte",
      "Apparence\u00a0: Auto",
    ]);
    expect(orderOf(render({ onOpenDeveloper: doNothing }))).toEqual([
      "Développeur",
      "Mon compte",
      "Apparence\u00a0: Auto",
    ]);
    expect(orderOf(render({ onOpenModeration: doNothing }))).toEqual([
      "Modération",
      "Mon compte",
      "Apparence\u00a0: Auto",
    ]);
    expect(orderOf(render({ onOpenDeveloper: doNothing, onOpenModeration: doNothing }))).toEqual([
      "Développeur",
      "Modération",
      "Mon compte",
      "Apparence\u00a0: Auto",
    ]);
  });

  // Un joueur connecté sans ces icônes : l'apparence, puis la photo
  it("puts the appearance, then the photo for a signed-in player without those icons", () => {
    expect(orderOf(render())).toEqual(["Apparence\u00a0: Auto", "Mon compte"]);
  });

  // Un invité : l'apparence, puis Se connecter sur PC ; sur mobile, Se connecter seul sans barre du bas, rien avec elle
  it("puts the appearance, then Se connecter for a guest on a PC, and Se connecter alone on mobile", () => {
    const guest = { identity: { kind: "guest" } } as const;

    expect(orderOf(render(guest))).toEqual(["Apparence\u00a0: Auto", SIGN_IN]);
    expect(orderOf(render({ ...guest, isCompact: true }))).toEqual([]);
    expect(orderOf(render({ ...guest, isCompact: true, hasBottomBar: false }))).toEqual([SIGN_IN]);
  });

  // Tant que le gateway n'a pas répondu : l'apparence seule
  it("shows the appearance alone while the identity is unknown", () => {
    expect(orderOf(render({ identity: { kind: "unknown" } }))).toEqual(["Apparence\u00a0: Auto"]);
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

// Nouveautés : un bouton fantôme pour tout le monde, à droite de la photo d'un compte connecté et avant l'apparence.
const NEWS = "Nouveautés";
const ORDER_TITLES = [...ALL_TITLES, NEWS];
const withNews = { onOpenReleaseNotes: doNothing } as const;
const guest = { identity: { kind: "guest" } } as const;

const orderWithNews = (markup: string): string[] =>
  ORDER_TITLES.map((title) => ({ title, at: positionOf(markup, title) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ title }) => title);

const newsButtonOf = (markup: string): string =>
  markup.match(/<button[^>]*title="Nouveautés"[^>]*>.*?<\/button>/s)?.[0] ?? "";

describe("le bouton Nouveautés de la pill Compte", () => {
  // Quand le compte est connu, le bouton Nouveautés est là pour tout le monde, après la photo et avant l'apparence
  it("stands right of the photo and before the appearance, for every role", () => {
    expect(orderWithNews(render({ ...withNews, onOpenSettings: doNothing }))).toEqual([
      "Réglages",
      "Mon compte",
      NEWS,
      "Apparence : Auto",
    ]);
    expect(orderWithNews(render({ ...withNews, onOpenModeration: doNothing }))).toEqual([
      "Modération",
      "Mon compte",
      NEWS,
      "Apparence : Auto",
    ]);
    expect(
      orderWithNews(render({ ...withNews, onOpenDeveloper: doNothing, onOpenSettings: doNothing })),
    ).toEqual(["Développeur", "Réglages", "Mon compte", NEWS, "Apparence : Auto"]);
  });

  // Un viewer connecté : sa photo, Nouveautés, puis l'apparence
  it("puts it after the photo of a signed-in viewer, before the appearance", () => {
    expect(orderWithNews(render(withNews))).toEqual(["Mon compte", NEWS, "Apparence : Auto"]);
  });

  // Un invité l'a aussi : avant l'apparence et Se connecter, qui gardent leur ordre
  it("gives a guest the button too, before the appearance and Se connecter", () => {
    expect(orderWithNews(render({ ...guest, ...withNews }))).toEqual([NEWS, "Apparence : Auto", SIGN_IN]);
  });

  // Le bouton est un bouton fantôme à icône seule, dont le titre est son nom accessible
  it("is a ghost icon button named by its title", () => {
    const button = newsButtonOf(render(withNews));

    expect(button).toContain("lp-btn--ghost");
    expect(button).toContain("lp-btn--icon");
    expect(button).toContain("<svg");
    expect(button).not.toContain("lp-avatar-dot");
  });

  // Sans l'ouvreur, la pill n'a pas de bouton Nouveautés : rien ne change pour qui ne le donne pas
  it("is absent when nothing opens it", () => {
    expect(render()).not.toContain(NEWS);
  });

  // Tant que le gateway n'a pas répondu, le rôle est inconnu : pas de bouton, le point dépendrait du rôle
  it("waits for the gateway: no button while the identity is unknown", () => {
    expect(render({ identity: { kind: "unknown" }, ...withNews })).not.toContain(NEWS);
    const compact = render({ identity: { kind: "unknown" }, isCompact: true, ...withNews });
    expect(compact).toContain("is-hidden");
    expect(compact).not.toContain("<button");
  });
});

describe("le point de Nouveautés", () => {
  // Tant que la dernière publication a des lignes non lues, le point est sur Nouveautés, et nulle part ailleurs
  it("sits on the Nouveautés button alone, never on the photo", () => {
    const markup = render({ ...withNews, hasUnreadReleaseNotes: true });

    expect(markup.match(/lp-avatar-dot/g)).toHaveLength(1);
    expect(newsButtonOf(markup)).toContain("lp-avatar-dot");
    expect(newsButtonOf(markup)).toContain("lp-btn--dot");
    expect(markup.indexOf("lp-avatar-dot")).toBeGreaterThan(positionOf(markup, "Mon compte"));
    expect(markup.indexOf("lp-avatar-dot")).toBeLessThan(positionOf(markup, "Apparence : Auto"));
  });

  // Tout est lu : pas de point
  it("shows no dot once everything is read", () => {
    expect(render({ ...withNews, hasUnreadReleaseNotes: false })).not.toContain("lp-avatar-dot");
    expect(render(withNews)).not.toContain("lp-avatar-dot");
  });

  // Le point des signalements garde sa place : sur Modération, ou sur la photo du streamer ; celui de Nouveautés est en plus
  it("leaves the report dot where it is: on Modération, or on the streamer's photo", () => {
    const moderator = render({
      ...withNews,
      hasUnreadReleaseNotes: true,
      onOpenModeration: doNothing,
      pendingReports: 2,
    });
    const owner = render({
      ...withNews,
      hasUnreadReleaseNotes: true,
      onOpenSettings: doNothing,
      pendingReports: 2,
    });

    expect(moderator.match(/lp-avatar-dot/g)).toHaveLength(2);
    expect(newsButtonOf(moderator)).toContain("lp-avatar-dot");
    expect(positionOf(moderator, "Modération · 2 signalements en attente")).toBeGreaterThanOrEqual(0);
    expect(owner.match(/lp-avatar-dot/g)).toHaveLength(2);
    expect(positionOf(owner, "Mon compte · 2 signalements en attente")).toBeGreaterThanOrEqual(0);
    expect(newsButtonOf(owner)).toContain("lp-avatar-dot");
  });

  // Un invité a le point, lui aussi : c'est le bouton qui le porte, pas un compte
  it("is carried by the button for a guest too", () => {
    expect(newsButtonOf(render({ ...guest, ...withNews, hasUnreadReleaseNotes: true }))).toContain(
      "lp-avatar-dot",
    );
  });
});

describe("la pill Compte sur mobile, avec Nouveautés", () => {
  // Sur mobile, un invité garde une pill avec ce seul bouton : ni apparence, ni Se connecter (la barre du bas le dit)
  it("keeps a guest's pill with the Nouveautés button alone", () => {
    const markup = render({ ...guest, ...withNews, isCompact: true });

    expect(markup).not.toContain("is-hidden");
    expect(markup).not.toContain("inert");
    expect(orderWithNews(markup)).toEqual([NEWS]);
    expect(markup.match(/<button/g)).toHaveLength(1);
  });

  // Sans barre du bas (une archive), l'invité sur mobile a Nouveautés, puis Se connecter
  it("gives a guest without a bottom bar Nouveautés, then Se connecter", () => {
    expect(orderWithNews(render({ ...guest, ...withNews, isCompact: true, hasBottomBar: false }))).toEqual([
      NEWS,
      SIGN_IN,
    ]);
  });

  // Un viewer connecté sur mobile : sa photo, puis Nouveautés, sans l'apparence
  it("gives a signed-in viewer the photo, then Nouveautés, without the appearance", () => {
    expect(orderWithNews(render({ ...withNews, isCompact: true }))).toEqual(["Mon compte", NEWS]);
  });

  // Le streamer sur mobile : Réglages, sa photo, puis Nouveautés, sans l'apparence
  it("gives the streamer Réglages, the photo, then Nouveautés, without the appearance", () => {
    expect(orderWithNews(render({ ...withNews, isCompact: true, onOpenSettings: doNothing }))).toEqual([
      "Réglages",
      "Mon compte",
      NEWS,
    ]);
  });

  // Sans l'ouvreur, l'invité sur mobile n'a toujours rien : la pill s'efface comme avant
  it("still hides a guest's pill on mobile when nothing opens Nouveautés", () => {
    expect(render({ ...guest, isCompact: true })).toContain("is-hidden");
  });
});

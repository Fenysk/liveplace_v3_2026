import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BubbleTargetsContext, createBubbleTargets } from "../help/bubble-target";
import { AccountWindow, SETTINGS_SECTION } from "./account-window";

const doNothing = (): void => undefined;

type WindowProps = Parameters<typeof AccountWindow>[0];

const tab = (text: string) => createElement("p", null, text);

// La fenêtre telle que la reçoit chaque rôle : le streamer a Canvas et Vue OBS, qui modère a Modération.
const windowProps = (props: Partial<WindowProps> = {}): WindowProps => ({
  isOpen: true,
  sectionId: "account",
  onSelect: doNothing,
  onClose: doNothing,
  user: { displayName: "Kalyss", login: "kalyss" },
  signOutHref: "#",
  appearanceChoice: "auto",
  onPickAppearance: doNothing,
  onRestartTutorial: doNothing,
  ...props,
});

const renderWindow = (props: Partial<WindowProps> = {}): string =>
  renderToStaticMarkup(createElement(AccountWindow, windowProps(props)));

const OWNER_TABS = {
  canvasTab: tab("contenu de la section Fresque"),
  obsTab: tab("contenu de la section Vue OBS"),
  moderationTab: tab("contenu de la section Modération"),
};

// Les libellés de la barre latérale (PC) et de la rangée d'onglets (mobile), dans l'ordre.
const sectionsOf = (markup: string): string[] =>
  [...(/<nav[^>]*>(.*?)<\/nav>/s.exec(markup)?.[1] ?? "").matchAll(/<\/svg>([^<]+)<\/button>/g)].map(
    ([, label]) => label ?? "",
  );

describe("la fenêtre ouverte par Réglages (CDC 2026, Fenêtre)", () => {
  // Quand le streamer presse Réglages, la fenêtre s'ouvre sur la section Canvas : taille et jauges
  it("opens on the Canvas section", () => {
    const markup = renderWindow({ sectionId: SETTINGS_SECTION, ...OWNER_TABS });

    expect(markup).toContain("contenu de la section Fresque");
    expect(markup).toMatch(/<h2[^>]*>Fresque<\/h2>/);
    expect(markup).not.toContain("contenu de la section Vue OBS");
  });

  // La section Vue OBS reste dans la barre latérale du streamer
  it("keeps the Vue OBS section in the sidebar", () => {
    expect(sectionsOf(renderWindow(OWNER_TABS))).toContain("Vue OBS");
  });
});

describe("les sections de la fenêtre (CDC 2026, Fenêtre)", () => {
  // Le streamer : Canvas, Vue OBS, Modération, Mon compte ; plus de Préférences
  it("lists Canvas, Vue OBS, Modération and Mon compte for the owner", () => {
    expect(sectionsOf(renderWindow(OWNER_TABS))).toEqual(["Fresque", "Vue OBS", "Modération", "Mon compte"]);
  });

  // Le streamer a aussi Archives, juste après Canvas (Écart §15, JOURNAL 2026-10-06) ; lui seul
  it("lists Archives right after Canvas for the owner, and for the owner alone", () => {
    const withCanvases = { ...OWNER_TABS, canvasesTab: tab("contenu de la section Archives") };

    expect(sectionsOf(renderWindow(withCanvases))).toEqual([
      "Fresque",
      "Archives",
      "Vue OBS",
      "Modération",
      "Mon compte",
    ]);
    expect(renderWindow({ ...withCanvases, sectionId: "canvases" })).toContain(
      "contenu de la section Archives",
    );
    expect(sectionsOf(renderWindow({ moderationTab: OWNER_TABS.moderationTab }))).not.toContain("Archives");
    expect(sectionsOf(renderWindow())).not.toContain("Archives");
  });

  // Qui modère sans posséder le canvas : Modération et Mon compte
  it("lists Modération and Mon compte for a moderator", () => {
    expect(sectionsOf(renderWindow({ moderationTab: OWNER_TABS.moderationTab }))).toEqual([
      "Modération",
      "Mon compte",
    ]);
  });

  // Un viewer : Mon compte seul
  it("lists Mon compte alone for a viewer", () => {
    expect(sectionsOf(renderWindow())).toEqual(["Mon compte"]);
  });

  // Aucun rôle ne voit ni ne reçoit de section Préférences
  it("has no Préférences section for anyone", () => {
    for (const markup of [renderWindow(OWNER_TABS), renderWindow(), renderWindow({ sectionId: "obs" })])
      expect(markup).not.toContain("Préférences");
  });
});

describe("la section Mon compte (CDC 2026, Fenêtre)", () => {
  // Mon compte garde le profil et Se déconnecter
  it("keeps the profile and the sign-out button", () => {
    const markup = renderWindow();

    expect(markup).toContain("Kalyss");
    expect(markup).toContain("Se déconnecter");
  });

  // Mon compte porte le choix de l'apparence : les trois choix, celui du moment coché
  it("holds the three appearance choices, the current one checked", () => {
    const markup = renderWindow({ appearanceChoice: "dark" });

    expect(markup).toMatch(/role="radiogroup" aria-label="Apparence"/);
    for (const label of ["Auto", "Clair", "Sombre"]) expect(markup).toContain(label);
    expect(markup).toMatch(/checked=""[^>]*value="dark"/);
    expect(markup).not.toMatch(/checked=""[^>]*value="(auto|light)"/);
  });

  // Mon compte porte aussi le choix de la langue, sous le thème, chaque langue écrite dans sa propre langue
  it("holds the language choice below the theme, each language in its own language", () => {
    const markup = renderWindow();

    expect(markup).toMatch(/role="radiogroup" aria-label="Langue"/);
    expect(markup).toContain("Français");
    expect(markup).toContain("English");
    expect(markup.indexOf('aria-label="Langue"')).toBeGreaterThan(markup.indexOf('aria-label="Thème"'));
    expect(markup).toMatch(/checked=""[^>]*value="fr"/);
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : « Revoir le tuto » remet le tutoriel à zéro sur l'appareil
describe("« Revoir le tuto » dans Mon compte (Écart §8.1, JOURNAL 2026-10-12)", () => {
  // Un bouton avec son libellé, sa rangée « Tutoriel » et son icône, sous la langue
  it("holds a Revoir le tuto button, in its own Tutoriel row below the language, with an icon", () => {
    const markup = renderWindow();
    const [, button = ""] =
      /<button[^>]*>((?:<svg.*?<\/svg>)?<span>Revoir le tuto<\/span>)<\/button>/.exec(markup) ?? [];

    expect(markup).toContain("Tutoriel");
    expect(button).toContain("<svg");
    expect(markup.indexOf("Revoir le tuto")).toBeGreaterThan(markup.indexOf('aria-label="Langue"'));
    expect(markup.indexOf("Tutoriel")).toBeLessThan(markup.indexOf("Revoir le tuto"));
  });

  // Seulement dans Mon compte : les autres sections n'y touchent pas
  it("is in the Mon compte section alone", () => {
    const markup = renderWindow({ ...OWNER_TABS, sectionId: "canvas" });

    expect(markup).not.toContain("Revoir le tuto");
    expect(renderWindow({ ...OWNER_TABS, sectionId: "obs" })).not.toContain("Revoir le tuto");
  });

  // Le bouton est un bouton pressé comme les autres, qui n'envoie ni ne lie rien à une adresse
  it("is a plain button, not a link", () => {
    expect(renderWindow()).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*Revoir le tuto/);
  });
});

describe("la section Classement de la fenêtre, sur mobile (JOURNAL 2026-10-06)", () => {
  const list = tab("contenu de la section Classement");

  // Met Classement avant Mon compte quand le mobile le donne, et nulle part sinon
  it("puts Classement before Mon compte when the phone gives it, and nowhere otherwise", () => {
    expect(sectionsOf(renderWindow({ scoreboardTab: list }))).toEqual(["Classement", "Mon compte"]);
    expect(sectionsOf(renderWindow({ ...OWNER_TABS, scoreboardTab: list }))).toEqual([
      "Fresque",
      "Vue OBS",
      "Modération",
      "Classement",
      "Mon compte",
    ]);
    expect(sectionsOf(renderWindow())).not.toContain("Classement");
  });

  // Ouvre la section Classement sur sa liste, et pas sur celle de Mon compte
  it("opens the Classement section on its list, and not on that of Mon compte", () => {
    const markup = renderWindow({ sectionId: "scoreboard", scoreboardTab: list });

    expect(markup).toContain("contenu de la section Classement");
    expect(markup).toMatch(/<h2[^>]*>Classement<\/h2>/);
    expect(markup).not.toContain("Se déconnecter");
  });

  // Retombe sur la première section quand Classement a disparu, sans titre de l'une et contenu d'une autre
  it("falls back to the first section when Classement is gone, with no title of one and content of another", () => {
    const markup = renderWindow({ sectionId: "scoreboard" });

    expect(markup).toMatch(/<h2[^>]*>Mon compte<\/h2>/);
    expect(markup).toContain("Se déconnecter");
  });
});

// Écart §8.1 (JOURNAL 2026-10-09 et 2026-10-12) : les onglets Vue OBS et Modération sont la cible des bulles qui invitent le streamer à les ouvrir
describe("les onglets Vue OBS et Modération, cibles d'une bulle d'aide (Écart §8.1, JOURNAL 2026-10-09 et 2026-10-12)", () => {
  const refs = createBubbleTargets();
  const inGame = (props: Partial<WindowProps>): string =>
    renderToStaticMarkup(
      createElement(BubbleTargetsContext, { value: refs }, createElement(AccountWindow, windowProps(props))),
    );
  const targetsIn = (markup: string): string[] =>
    [
      ...markup.matchAll(/<span class="lp-bubble-target"><button[^>]*>(?:<svg.*?<\/svg>)([^<]+)<\/button>/g),
    ].map(([, label]) => label ?? "");

  // Dans la page de jeu : les seuls onglets enveloppés sont Vue OBS et Modération, les autres restent des boutons seuls
  it("wraps the Vue OBS and Moderation tabs, and only them, in the game page", () => {
    expect(targetsIn(inGame(OWNER_TABS))).toEqual(["Vue OBS", "Modération"]);
  });

  // Qui n'est pas le streamer n'a pas l'onglet Vue OBS : Modération seul, et rien sans lui
  it("wraps only the tabs the role has: Moderation for a moderator, nothing for a viewer", () => {
    expect(targetsIn(inGame({ moderationTab: tab("contenu de la section Modération") }))).toEqual([
      "Modération",
    ]);
    expect(targetsIn(inGame({}))).toEqual([]);
  });

  // Hors de la page de jeu, l'onglet reste seul : aucun `<span>` de plus
  it("leaves the tab alone outside the game page", () => {
    expect(renderWindow(OWNER_TABS)).not.toContain("lp-bubble-target");
  });
});

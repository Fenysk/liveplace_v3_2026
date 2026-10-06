import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountWindow, SETTINGS_SECTION } from "./account-window";

const doNothing = (): void => undefined;

type WindowProps = Parameters<typeof AccountWindow>[0];

const tab = (text: string) => createElement("p", null, text);

// La fenêtre telle que la reçoit chaque rôle : le streamer a Canvas et Vue OBS, qui modère a Modération.
const renderWindow = (props: Partial<WindowProps> = {}): string =>
  renderToStaticMarkup(
    createElement(AccountWindow, {
      isOpen: true,
      sectionId: "account",
      onSelect: doNothing,
      onClose: doNothing,
      user: { displayName: "Kalyss", login: "kalyss" },
      signOutHref: "#",
      themeChoice: "auto",
      onPickTheme: doNothing,
      ...props,
    }),
  );

const OWNER_TABS = {
  canvasTab: tab("contenu de la section Canvas"),
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

    expect(markup).toContain("contenu de la section Canvas");
    expect(markup).toMatch(/<h2[^>]*>Canvas<\/h2>/);
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
    expect(sectionsOf(renderWindow(OWNER_TABS))).toEqual(["Canvas", "Vue OBS", "Modération", "Mon compte"]);
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

  // Mon compte porte le choix du thème : les trois choix, celui du moment coché
  it("holds the three theme choices, the current one checked", () => {
    const markup = renderWindow({ themeChoice: "dark" });

    expect(markup).toMatch(/role="radiogroup" aria-label="Thème"/);
    for (const label of ["Auto", "Clair", "Sombre"]) expect(markup).toContain(label);
    expect(markup).toMatch(/checked=""[^>]*value="dark"/);
    expect(markup).not.toMatch(/checked=""[^>]*value="(auto|light)"/);
  });
});

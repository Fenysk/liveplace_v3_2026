import { BACKGROUND_IMAGE_OPACITY_STEPS, OBS_BACKGROUNDS, type ObsBackground } from "@liveplace/domain";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type BackgroundField,
  type BackgroundImageField,
  BackgroundImageSettings,
  BackgroundSettings,
  CanvasSettings,
} from "./canvas-settings";

// Écart §9.1 (JOURNAL 2026-10-10) : le fond de la fresque (Transparent, Noir ou Blanc) et son image, deux réglages de la section
// Fresque, sous le thème. L'image se pose par-dessus n'importe quel fond, à une opacité de 0 à 100 % par crans de 10.

const doNothing = (): void => undefined;
const IMAGE_URL = "/kalyss/background?v=1760000000000";

const BACKGROUND_NAMES: Record<ObsBackground, string> = {
  transparent: "Transparent",
  black: "Noir",
  white: "Blanc",
};

const fieldOf = (overrides: Partial<BackgroundField> = {}): BackgroundField => ({
  value: "transparent",
  isTouch: false,
  onPick: doNothing,
  ...overrides,
});

const imageOf = (overrides: Partial<BackgroundImageField> = {}): BackgroundImageField => ({
  imageUrl: IMAGE_URL,
  background: "transparent",
  opacity: 40,
  isSending: false,
  onChooseFile: doNothing,
  onClearImage: doNothing,
  onPickOpacity: doNothing,
  ...overrides,
});

const backgroundHtml = (overrides: Partial<BackgroundField> = {}): string =>
  renderToString(createElement(BackgroundSettings, { background: fieldOf(overrides) }));

const imageHtml = (overrides: Partial<BackgroundImageField> = {}): string =>
  renderToString(createElement(BackgroundImageSettings, { image: imageOf(overrides) }));

const sectionHtml = (image: Partial<BackgroundImageField> = {}): string =>
  renderToString(
    createElement(CanvasSettings, {
      theme: { status: "ready", value: "", isSaving: false, onInput: doNothing, onCommit: doNothing },
      background: fieldOf(),
      image: imageOf(image),
      current: { width: 50, height: 50 },
      choice: { format: "1:1", sizeIndex: 0 },
      chosen: { width: 50, height: 50 },
      onChoose: doNothing,
      onApply: doNothing,
    }),
  );

// Le contenu de la légende : le titre du groupe, puis le nom du choix à sa droite
const legendOf = (html: string): string => html.match(/<legend[^>]*>(.*?)<\/legend>/)?.[1] ?? "";

// Les libellés des boutons, l'apostrophe que React écrit en entité redevenue une apostrophe
const buttonsOf = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*class="lp-btn[^"]*"[^>]*>(?:<span>)?([^<]*)/g)].map(([, label]) =>
    (label ?? "").replaceAll("&#x27;", "'"),
  );

describe("the background of the canvas in the settings (CDC 2026 §1, Écart §9.1)", () => {
  // Un clavier de couleurs sous « Fond de la fresque », sans interrupteur
  it("shows the color keyboard under « Fond de la fresque », and no switch", () => {
    const html = backgroundHtml();

    expect(html).toContain("<legend");
    expect(html).toContain("Fond de la fresque");
    expect(html).not.toContain('type="checkbox"');
  });

  // Transparent, Noir, Blanc, dans cet ordre, sans nom dessous, et rien d'autre : l'image n'est pas un fond
  it("offers Transparent, Noir and Blanc in that order, black and white by a tone class, and no Image: it is no background", () => {
    const swatches = [
      ...backgroundHtml().matchAll(/<button[^>]*class="(lp-swatch[^"]*)"[^>]*aria-label="([^"]*)"/g),
    ].map(([, className, label]) => [className, label]);

    expect(swatches).toEqual([
      ["lp-swatch is-transparent", "Transparent"],
      ["lp-swatch lp-swatch--png-black", "Noir"],
      ["lp-swatch lp-swatch--png-white", "Blanc"],
    ]);
    expect(backgroundHtml()).not.toContain('aria-label="Image"');
  });

  // Un réglage : la valeur actuelle est toujours sélectionnée, jamais de choix vide
  it("always selects the current value, whichever it is, and only it", () => {
    for (const background of OBS_BACKGROUNDS) {
      const pressed = [
        ...backgroundHtml({ value: background }).matchAll(/aria-label="([^"]*)"[^>]*aria-pressed="true"/g),
      ].map(([, label]) => label);

      expect(pressed).toEqual([BACKGROUND_NAMES[background]]);
    }
  });

  // Le nom du fond choisi est à droite du titre, comme « 10 s » à droite de « Délai », et caché aux lecteurs d'écran
  it("names the chosen background on the right of the title, whichever it is, and hides that name from screen readers", () => {
    for (const background of OBS_BACKGROUNDS) {
      expect(legendOf(backgroundHtml({ value: background }))).toMatch(
        new RegExp(
          `^Fond de la fresque<span class="lp-type-numeric" aria-hidden="true">${BACKGROUND_NAMES[background]}</span>$`,
        ),
      );
    }
  });

  // Les pastilles sont seules dans leur rangée, sans nom dessous
  it("puts no name under the swatches: the row holds the three buttons only", () => {
    const row =
      backgroundHtml().match(/<div class="lp-palette lp-palette--choice[^"]*">(.*?)<\/div>/)?.[1] ?? "";

    expect(row.match(/<button[^>]*>/g)).toHaveLength(OBS_BACKGROUNDS.length);
    expect(row.replace(/<button[^>]*>|<\/button>/g, "")).toBe("");
    expect(backgroundHtml()).not.toContain("lp-swatch-option");
  });

  // Sur un écran étroit ou tactile : les pastilles rondes de la taille d'un contrôle, comme dans la fenêtre du PNG
  it("gives round touch swatches on a narrow or touch screen, and the compact ones otherwise", () => {
    expect(backgroundHtml({ isTouch: true })).toContain("lp-palette--touch");
    expect(backgroundHtml()).not.toContain("lp-palette--touch");
  });

  // La CSP de production bloque l'attribut `style` du HTML du serveur : ni les pastilles ni la phrase n'en portent
  it("carries no inline style: the production CSP would block it", () => {
    for (const background of OBS_BACKGROUNDS)
      expect(backgroundHtml({ value: background })).not.toMatch(/\sstyle=/);
  });
});

describe("the image of the canvas in the settings (Écart §9.1, JOURNAL 2026-10-10)", () => {
  // Sans image : le seul bouton « Choisir une image », ni vignette ni curseur
  it("asks for the file with a single button when there is no image, with no thumbnail and no slider", () => {
    const html = imageHtml({ imageUrl: null });

    expect(buttonsOf(html)).toEqual(["Choisir une image"]);
    expect(html).not.toContain("lp-bg-preview");
    expect(html).not.toContain('type="range"');
  });

  // Avec une image : la changer ou la retirer, la vignette, et le curseur d'opacité
  it("lets the image be changed or removed when there is one, with its thumbnail and its opacity slider", () => {
    const html = imageHtml();

    expect(buttonsOf(html)).toEqual(["Changer l'image", "Retirer l'image"]);
    expect(html).toContain("lp-bg-preview");
    expect(html).toContain('type="range"');
  });

  // La vignette montre l'image à l'adresse du même domaine, par-dessus le fond choisi, à l'opacité du curseur
  it("shows the thumbnail with the image of the same domain over the chosen background, at the opacity of the slider", () => {
    for (const background of OBS_BACKGROUNDS) {
      const html = imageHtml({ background, opacity: 80 });

      expect(html).toContain(`class="lp-bg-preview lp-bg-preview--${background}"`);
      expect(html).toContain(`src="${IMAGE_URL}"`);
      expect(html).toContain('data-opacity="80"');
    }
  });

  // L'opacité va de 0 à 100 % par crans de 10 : onze crans, la valeur à côté du libellé, les deux bouts dessous
  it("steps the opacity from 0 to 100 % by ten: eleven steps, the value next to the label, the two ends under it", () => {
    const html = imageHtml({ opacity: 40 });

    expect(html).toMatch(
      /<label[^>]*>Opacité de l&#x27;image<\/label><span class="lp-type-numeric">40 %<\/span>/,
    );
    expect(html).toContain(`max="${BACKGROUND_IMAGE_OPACITY_STEPS.length - 1}"`);
    expect(html).toContain('aria-valuetext="40 %"');
    expect(html).toMatch(/<span>0 %<\/span><span>100 %<\/span>/);
  });

  // La vignette est décrite aux lecteurs d'écran, l'image elle-même est décorative
  it("describes the thumbnail to screen readers, and leaves the image itself decorative", () => {
    const html = imageHtml();

    expect(html).toMatch(/role="img" aria-label="L&#x27;image sur le fond choisi"/);
    expect(html).toContain('alt=""');
  });

  // Le sélecteur de fichier ne propose que les trois formats, caché derrière les boutons, sans entrer dans l'ordre de tabulation
  it("accepts only PNG, JPEG and WebP, with the file field hidden behind the buttons and out of the tab order", () => {
    for (const html of [imageHtml(), imageHtml({ imageUrl: null })]) {
      expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/png,image\/jpeg,image\/webp"[^>]*>/);
      expect(html).toMatch(/<input[^>]*hidden=""[^>]*tabindex="-1"/);
    }
  });

  // Pendant l'envoi, les boutons attendent la réponse : jamais deux envois à la fois
  it("makes the buttons wait for the answer while the image is being sent", () => {
    const disabled = (html: string) => [...html.matchAll(/<button[^>]*class="lp-btn[^"]*"[^>]*disabled=""/g)];

    expect(disabled(imageHtml({ isSending: true }))).toHaveLength(2);
    expect(disabled(imageHtml({ imageUrl: null, isSending: true }))).toHaveLength(1);
    expect(disabled(imageHtml())).toHaveLength(0);
  });

  // La phrase des bornes accompagne les boutons : formats, 2 Mo, 2048 px
  it("says the formats and the limits under the buttons, with an image or without", () => {
    for (const html of [imageHtml(), imageHtml({ imageUrl: null })]) {
      expect(html).toContain("PNG, JPEG ou WebP");
      expect(html).toContain("2 Mo");
      expect(html).toContain("2048 px");
    }
  });

  // La CSP de production bloque l'attribut `style` du HTML du serveur : la vignette a sa teinte et son opacité par des classes et un attribut
  it("carries no inline style, the thumbnail taking its tint and its opacity from classes and an attribute", () => {
    for (const background of OBS_BACKGROUNDS)
      for (const opacity of BACKGROUND_IMAGE_OPACITY_STEPS)
        expect(imageHtml({ background, opacity })).not.toMatch(/\sstyle=/);
  });
});

describe("the background and the image in the Canvas section (Écart §9.1, JOURNAL 2026-10-10)", () => {
  // Sous le thème, avant la taille : le fond puis l'image sont les deuxième et troisième réglages de la section
  it("comes under the theme and before the size, the background first and the image after it", () => {
    const html = sectionHtml();
    const [theme, background, image, size] = [
      "Thème",
      "Fond de la fresque",
      "Image de la fresque",
      "Taille de la fresque",
    ].map((text) => html.indexOf(text));

    expect(theme).toBeGreaterThan(-1);
    expect(background).toBeGreaterThan(theme ?? 0);
    expect(image).toBeGreaterThan(background ?? 0);
    expect(size).toBeGreaterThan(image ?? 0);
  });

  // Un seul bouton plein par section : Changer la taille ; les boutons de l'image ne le sont pas
  it("keeps a single filled button in the section, Changer la taille, the image buttons not being filled", () => {
    const html = sectionHtml();
    const filled = [
      ...html.matchAll(/<button[^>]*class="lp-btn[^"]*lp-btn--primary[^"]*"[^>]*>(?:<span>)?([^<]*)/g),
    ];

    expect(filled.map(([, label]) => label)).toEqual(["Changer la taille"]);
    expect(buttonsOf(html)).toContain("Changer l'image");
  });

  // Sans image, la section n'a que le bouton qui la demande, et celui de la taille
  it("holds only the button that asks for the image, and the one of the size, when there is no image", () => {
    expect(buttonsOf(sectionHtml({ imageUrl: null }))).toEqual(["Choisir une image", "Changer la taille"]);
  });
});

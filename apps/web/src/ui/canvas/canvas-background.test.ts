import { OBS_BACKGROUNDS } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import {
  type Backdrop,
  coverSource,
  createBackdropImage,
  renderBackdrop,
  toBackdrop,
} from "./canvas-background";

// Écart §9.1 (JOURNAL 2026-10-10) : le fond de la fresque, peint sous les pixels, le même pinceau en jeu et dans la vue OBS.

const PROPERTIES: Record<string, string> = { "--obs-black": "#000000", "--obs-white": "#ffffff" };
const getProperty = (property: string): string => PROPERTIES[property] ?? "";
// Un faux élément : le contexte de test ne lit jamais ses pixels, il ne fait que le désigner.
const PICTURE_SOURCE = { width: 1600, height: 900 } as HTMLCanvasElement;
const PICTURE = { source: PICTURE_SOURCE, width: 1600, height: 900 };

describe("coverSource", () => {
  // Quand l'image est plus large que le cadre, le système doit la remplir en hauteur, centrée, rognée à gauche et à droite
  it("fills the height of a frame narrower than the image, centered, cropped left and right", () => {
    expect(coverSource({ width: 1600, height: 900 }, { width: 100, height: 100 })).toEqual({
      left: 350,
      top: 0,
      width: 900,
      height: 900,
    });
  });

  // Quand l'image est plus haute que le cadre, le système doit la remplir en largeur, centrée, rognée en haut et en bas
  it("fills the width of a frame wider than the image, centered, cropped top and bottom", () => {
    expect(coverSource({ width: 900, height: 1600 }, { width: 200, height: 100 })).toEqual({
      left: 0,
      top: 575,
      width: 900,
      height: 450,
    });
  });

  // Quand l'image et le cadre ont les mêmes proportions, le système ne doit rien rogner, quelle que soit leur taille
  it("crops nothing when the image and the frame have the same proportions, whatever their sizes", () => {
    expect(coverSource({ width: 1600, height: 900 }, { width: 16, height: 9 })).toEqual({
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
    });
    expect(coverSource({ width: 100, height: 100 }, { width: 5000, height: 5000 })).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
  });
});

describe("toBackdrop", () => {
  // Transparent sans image ne peint rien et ne lit aucun jeton : ni fond, ni image
  it("paints nothing for transparent without an image, reading no token", () => {
    const read: string[] = [];
    const reading = (property: string): string => {
      read.push(property);
      return getProperty(property);
    };

    expect(toBackdrop("transparent", null, 40, reading)).toEqual({ fill: null, image: null });
    expect(read).toEqual([]);
  });

  // Le noir et le blanc se peignent par leur jeton, plein
  it("fills black and white with their token", () => {
    expect(toBackdrop("black", null, 40, getProperty)).toEqual({ fill: "#000000", image: null });
    expect(toBackdrop("white", null, 40, getProperty)).toEqual({ fill: "#ffffff", image: null });
  });

  // L'image chargée se pose par-dessus n'importe quel fond, transparent compris, avec son opacité, sa taille et sa source
  it("lays a loaded image over any background, transparent included, with its opacity, size and source", () => {
    const image = { source: PICTURE.source, size: { width: 1600, height: 900 }, opacity: 80 };

    expect(toBackdrop("transparent", PICTURE, 80, getProperty)).toEqual({ fill: null, image });
    expect(toBackdrop("black", PICTURE, 80, getProperty)).toEqual({ fill: "#000000", image });
    expect(toBackdrop("white", PICTURE, 80, getProperty)).toEqual({ fill: "#ffffff", image });
  });

  // Une image qui n'est pas chargée, ou à 0 %, ne peint rien : le fond reste seul
  it("lays no image while none is loaded, or at 0 %, the background staying alone", () => {
    expect(toBackdrop("black", null, 40, getProperty).image).toBeNull();
    expect(toBackdrop("black", PICTURE, 0, getProperty)).toEqual({ fill: "#000000", image: null });
  });

  // Chaque fond de la liste est traité : aucun ne laisse la fresque sans réponse
  it("answers for every background of the list", () => {
    for (const background of OBS_BACKGROUNDS) {
      expect(toBackdrop(background, PICTURE, 40, getProperty).image?.opacity).toBe(40);
    }
  });
});

// Un contexte qui note ce qu'on lui demande, dans l'ordre, avec l'état des réglages au moment de l'appel
const recordingContext = () => {
  const calls: string[] = [];
  const state = { fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
  const context = new Proxy(state, {
    get(target, name: string) {
      if (name in target) return target[name as keyof typeof target];
      return (...args: unknown[]) => {
        const shown = args.map((arg) => (typeof arg === "object" ? "image" : String(arg)));
        calls.push(
          `${name}(${shown.join(", ")}) fill=${state.fillStyle} alpha=${state.globalAlpha} smooth=${state.imageSmoothingEnabled}/${state.imageSmoothingQuality}`,
        );
      };
    },
    set(target, name: string, value) {
      Object.assign(target, { [name]: value });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls, state };
};

const FRAME = { left: 10, top: 20, width: 100, height: 100 };

describe("renderBackdrop", () => {
  const picture = { source: PICTURE.source, size: { width: 1600, height: 900 } };
  const lay = (opacity: number): Backdrop => ({ fill: null, image: { ...picture, opacity } });

  // Sans fond ni image, le système ne doit rien demander au contexte
  it("asks the context for nothing without a background nor an image", () => {
    const { context, calls } = recordingContext();

    renderBackdrop(context, FRAME, { fill: null, image: null });

    expect(calls).toEqual([]);
  });

  // Un fond plein remplit le cadre de la fresque, et lui seul
  it("fills the frame of the canvas, and only it, with a plain background", () => {
    const { context, calls } = recordingContext();

    renderBackdrop(context, FRAME, { fill: "#000000", image: null });

    expect(calls).toEqual(["fillRect(10, 20, 100, 100) fill=#000000 alpha=1 smooth=false/low"]);
  });

  // L'image seule, sur la transparence : aucun fond n'est peint, elle est recadrée comme `cover`, lissée, à son opacité
  it("lays the image alone over transparency, with no background painted: cropped like cover, smoothed, at its opacity", () => {
    const { context, calls } = recordingContext();

    renderBackdrop(context, FRAME, lay(40));

    expect(calls).toEqual([
      "save() fill= alpha=1 smooth=false/low",
      "drawImage(image, 350, 0, 900, 900, 10, 20, 100, 100) fill= alpha=0.4 smooth=true/high",
      "restore() fill= alpha=0.4 smooth=true/high",
    ]);
  });

  // Le fond plein d'abord, puis l'image par-dessus à son opacité : plus elle est basse, plus le fond se voit à travers
  it("paints the plain background first, then the image over it at its opacity", () => {
    const { context, calls } = recordingContext();

    renderBackdrop(context, FRAME, { fill: "#ffffff", image: lay(80).image });

    expect(calls).toEqual([
      "fillRect(10, 20, 100, 100) fill=#ffffff alpha=1 smooth=false/low",
      "save() fill=#ffffff alpha=1 smooth=false/low",
      "drawImage(image, 350, 0, 900, 900, 10, 20, 100, 100) fill=#ffffff alpha=0.8 smooth=true/high",
      "restore() fill=#ffffff alpha=0.8 smooth=true/high",
    ]);
  });

  // L'opacité du réglage est celle du pinceau, cran pour cran : 10 % pèse 0,1 et 100 % pèse 1, sans autre mélange
  it("draws at the opacity of the setting, step for step, with no other mix", () => {
    for (const [percent, alpha] of [
      [10, 0.1],
      [50, 0.5],
      [100, 1],
    ] as const) {
      const { context, state } = recordingContext();

      renderBackdrop(context, FRAME, lay(percent));

      expect(state.globalAlpha).toBe(alpha);
    }
  });
});

// Un faux élément <img> : `load` et `fail` jouent la réponse du réseau.
const makeImages = () => {
  const made: HTMLImageElement[] = [];
  const create = (): HTMLImageElement => {
    const image = {
      src: "",
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null,
      onerror: null,
    } as HTMLImageElement;
    made.push(image);
    return image;
  };
  const load = (image: HTMLImageElement | undefined): void => {
    if (!image) return;
    Object.assign(image, { naturalWidth: 1600, naturalHeight: 900 });
    image.onload?.(new Event("load"));
  };
  const fail = (image: HTMLImageElement | undefined): void => {
    image?.onerror?.(new Event("error"));
  };
  return { made, create, load, fail };
};

describe("createBackdropImage", () => {
  // Un fond d'image qui n'a pas d'adresse ne montre rien ; une adresse chargée se montre, et le dit une fois chargée
  it("shows nothing without an address, then the image once it is loaded, and says so when it is", () => {
    const { made, create, load } = makeImages();
    let ready = 0;
    const image = createBackdropImage(() => {
      ready += 1;
    }, create);

    expect(image.get()).toBeNull();
    image.set("/fenysk/background?v=1");
    expect(made[0]?.src).toBe("/fenysk/background?v=1");
    expect(image.get()).toBeNull();

    load(made[0]);

    expect(image.get()).toEqual({ source: made[0], width: 1600, height: 900 });
    expect(ready).toBe(1);
  });

  // La même adresse ne recharge rien ; une autre garde l'ancienne image jusqu'à ce que la nouvelle soit chargée
  it("loads nothing again for the same address, and keeps the old image until the new one is loaded", () => {
    const { made, create, load } = makeImages();
    const image = createBackdropImage(() => undefined, create);
    image.set("/fenysk/background?v=1");
    load(made[0]);

    image.set("/fenysk/background?v=1");
    image.set("/fenysk/background?v=2");
    expect(made).toHaveLength(2);
    expect(image.get()?.source).toBe(made[0]);

    load(made[1]);
    expect(image.get()?.source).toBe(made[1]);
  });

  // Sans adresse, l'image part aussitôt ; une adresse qui ne charge pas ne laisse rien ; une réponse tardive de l'ancienne adresse est ignorée
  it("drops the image at once without an address, shows none for an address that fails, and ignores a late answer from an old address", () => {
    const { made, create, load, fail } = makeImages();
    const image = createBackdropImage(() => undefined, create);
    image.set("/a");
    load(made[0]);
    image.set(null);
    expect(image.get()).toBeNull();

    image.set("/b");
    fail(made[1]);
    expect(image.get()).toBeNull();

    image.set("/c");
    image.set("/d");
    load(made[2]);
    expect(image.get()).toBeNull();
    load(made[3]);
    expect(image.get()?.source).toBe(made[3]);
  });

  // Quand la page se ferme, plus aucune image ne se signale
  it("signals no image any more once disposed", () => {
    const { made, create, load } = makeImages();
    let ready = 0;
    const image = createBackdropImage(() => {
      ready += 1;
    }, create);
    image.set("/a");

    image.dispose();
    load(made[0]);

    expect(ready).toBe(0);
    expect(image.get()).toBeNull();
  });
});

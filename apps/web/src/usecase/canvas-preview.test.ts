import { defaultCanvasMeta, type User } from "@liveplace/domain";
import type { ArchiveWrites, CanvasImage, DurableStore } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  createCanvasPreviews,
  MAX_CACHED_PREVIEWS,
  PREVIEW_REFRESH_MS,
  type PreviewInput,
} from "./canvas-preview";

// Un login a toujours un canvas actif `canvas-<login>` ; ce que Redis en sert se règle par canvas
type World = { notReady: Set<string>; noImage: Set<string>; tornImage: Set<string>; failing: Set<string> };

const IMAGE: CanvasImage = { width: 2, height: 1, state: Uint8Array.from([5, 0]) };

const setup = (logins: readonly string[] = ["fenysk"]) => {
  const world: World = { notReady: new Set(), noImage: new Set(), tornImage: new Set(), failing: new Set() };
  const lookups: string[] = [];
  const reads: string[] = [];
  const renders: CanvasImage[] = [];
  const inputs: PreviewInput[] = [];
  let nowMs = 1_000_000;
  const durable: Pick<DurableStore, "getUserByLogin" | "getActiveCanvasForOwner"> = {
    getUserByLogin: async (login) => {
      lookups.push(login);
      return logins.includes(login)
        ? ({
            userId: login,
            login,
            displayName: login,
            avatarUrl: `https://static-cdn.jtvnw.net/${login}.png`,
          } satisfies User)
        : null;
    },
    getActiveCanvasForOwner: async (ownerId) => ({
      canvasId: `canvas-${ownerId}`,
      width: 2,
      height: 1,
      ...(ownerId === "fenysk" ? { theme: "Été" } : {}),
    }),
  };
  const redis: Pick<ArchiveWrites, "getCanvas" | "getCanvasImage"> = {
    getCanvas: async (canvasId) => (world.notReady.has(canvasId) ? null : defaultCanvasMeta("1")),
    getCanvasImage: async (canvasId) => {
      reads.push(canvasId);
      if (world.failing.has(canvasId)) throw new Error("redis down");
      if (world.noImage.has(canvasId)) return null;
      return world.tornImage.has(canvasId) ? { ...IMAGE, state: Uint8Array.from([5]) } : IMAGE;
    },
  };
  const previews = createCanvasPreviews({
    durable,
    redis,
    render: async (input) => {
      inputs.push(input);
      renders.push(input.image);
      return Uint8Array.from([renders.length]);
    },
    now: () => nowMs,
  });
  const advance = (ms: number): void => {
    nowMs += ms;
  };
  return { previews, world, lookups, reads, renders, inputs, advance };
};

describe("l'image d'aperçu servie pour un login", () => {
  // Quand le login a un canvas que Redis sert, le système doit rendre l'image de ce canvas, que le login soit en capitales ou non
  it("renders the image of the canvas of the login, in capitals or not", async () => {
    const { previews, renders } = setup();

    const png = await previews.get("Fenysk");

    expect(png).toEqual(Uint8Array.from([1]));
    expect(renders).toEqual([IMAGE]);
  });

  // Quand le canvas est rendu, le système doit donner au rendu le propriétaire et le thème de la page, et pas de thème s'il n'en a pas
  it("gives the renderer the owner and the theme of the page, and no theme when there is none", async () => {
    const { previews, inputs } = setup(["fenysk", "mr_pixel"]);

    await previews.get("fenysk");
    await previews.get("mr_pixel");

    expect(inputs[0]).toEqual({
      image: IMAGE,
      owner: { displayName: "fenysk", login: "fenysk", avatarUrl: "https://static-cdn.jtvnw.net/fenysk.png" },
      theme: "Été",
    });
    expect(inputs[1]).toEqual({
      image: IMAGE,
      owner: {
        displayName: "mr_pixel",
        login: "mr_pixel",
        avatarUrl: "https://static-cdn.jtvnw.net/mr_pixel.png",
      },
    });
  });

  // Si le login n'a pas de canvas, alors le système ne doit rendre aucune image
  it("renders nothing for a login without a canvas", async () => {
    const { previews, renders } = setup();

    expect(await previews.get("inconnu")).toBeNull();
    expect(renders).toHaveLength(0);
  });

  // Si Redis ne sert pas le canvas, perdu ou en récupération, alors le système ne doit rendre aucune image ni lire son état
  it("renders nothing and reads no state when Redis does not serve the canvas, lost or recovering", async () => {
    const { previews, world, reads, renders } = setup();
    world.notReady.add("canvas-fenysk");

    expect(await previews.get("fenysk")).toBeNull();
    expect(renders).toHaveLength(0);
    expect(reads).toHaveLength(0);
  });

  // Si l'état est absent ou n'a pas la taille largeur × hauteur (un agrandissement en cours), alors le système ne doit rien rendre
  it("renders nothing when the state is missing or is not width times height, as during a resize", async () => {
    const { previews, world, renders } = setup(["fenysk", "mr_pixel"]);
    world.noImage.add("canvas-fenysk");
    world.tornImage.add("canvas-mr_pixel");

    expect(await previews.get("fenysk")).toBeNull();
    expect(await previews.get("mr_pixel")).toBeNull();
    expect(renders).toHaveLength(0);
  });
});

describe("le cache des images d'aperçu", () => {
  // Quand le même canvas est demandé plusieurs fois dans la minute, le système ne doit chercher son login, le lire et le rendre qu'une fois
  it("looks the login up, reads and renders a canvas once while the minute lasts, then again once it is over", async () => {
    const { previews, lookups, reads, renders, advance } = setup();

    const first = await previews.get("fenysk");
    advance(PREVIEW_REFRESH_MS - 1);
    const second = await previews.get("Fenysk");
    advance(1);
    const third = await previews.get("fenysk");

    expect(second).toBe(first);
    expect(third).toEqual(Uint8Array.from([2]));
    expect(renders).toHaveLength(2);
    expect(reads).toHaveLength(2);
    expect(lookups).toHaveLength(2);
  });

  // Quand deux demandes arrivent ensemble, le système doit les servir d'un seul rendu
  it("serves two requests that arrive together from a single render", async () => {
    const { previews, renders } = setup();

    const [first, second] = await Promise.all([previews.get("fenysk"), previews.get("fenysk")]);

    expect(first).toBe(second);
    expect(renders).toHaveLength(1);
  });

  // Quand un canvas n'était pas prêt puis le devient, le système ne doit pas avoir gardé son refus
  it("keeps no refusal: a canvas that becomes ready is served at the next request", async () => {
    const { previews, world, renders } = setup();
    world.notReady.add("canvas-fenysk");
    expect(await previews.get("fenysk")).toBeNull();

    world.notReady.clear();

    expect(await previews.get("fenysk")).toEqual(Uint8Array.from([1]));
    expect(renders).toHaveLength(1);
  });

  // Si Redis tombe pendant la lecture, alors le système doit laisser l'erreur remonter sans la garder
  it("lets a Redis failure rise and keeps nothing of it", async () => {
    const { previews, world } = setup();
    world.failing.add("canvas-fenysk");
    await expect(previews.get("fenysk")).rejects.toThrow("redis down");

    world.failing.clear();

    expect(await previews.get("fenysk")).toEqual(Uint8Array.from([1]));
  });

  // Quand plus de canvas que le plafond sont demandés, le système doit oublier les plus anciens et garder les récents
  it("forgets the oldest canvases once more than the cap were asked, and keeps the recent ones", async () => {
    const logins = Array.from({ length: MAX_CACHED_PREVIEWS + 1 }, (_, index) => `canvas${index}`);
    const { previews, renders } = setup(logins);
    for (const login of logins) await previews.get(login);
    expect(renders).toHaveLength(logins.length);

    await previews.get(logins[logins.length - 1] ?? "");
    expect(renders).toHaveLength(logins.length);
    await previews.get(logins[0] ?? "");

    expect(renders).toHaveLength(logins.length + 1);
  });
});

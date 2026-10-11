import type { User } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  BACKGROUND_IMAGE_KEPT_MS,
  createBackgroundImages,
  MAX_CACHED_BACKGROUND_IMAGES,
} from "./background-images";

// Écart §9.1 (JOURNAL 2026-10-10) : l'image du fond d'un login, lue dans Convex une fois par login et par instant, puis gardée en
// mémoire : mille pages qui s'ouvrent ne coûtent pas mille lectures de fichier.

const AT = 1_760_000_000_000;

const setup = (logins: readonly string[] = ["fenysk"]) => {
  const lookups: string[] = [];
  const reads: { ownerId: string; at: number }[] = [];
  const state = { failing: false, currentAt: AT };
  let nowMs = 1_000_000;
  const durable: Pick<DurableStore, "getUserByLogin" | "getActiveCanvasBackgroundImage"> = {
    getUserByLogin: async (login) => {
      lookups.push(login);
      return logins.includes(login)
        ? ({ userId: `id-${login}`, login, displayName: login, avatarUrl: "" } satisfies User)
        : null;
    },
    getActiveCanvasBackgroundImage: async (ownerId, at) => {
      reads.push({ ownerId, at });
      if (state.failing) throw new Error("Convex down");
      return at === state.currentAt ? Uint8Array.from([1, 2, 3]) : null;
    },
  };
  const images = createBackgroundImages({ durable, now: () => nowMs });
  const advance = (ms: number): void => {
    nowMs += ms;
  };
  return { images, lookups, reads, state, advance };
};

describe("l'image du fond servie pour un login", () => {
  // Quand le login a une image de cet instant, le système doit rendre ses octets, que le login soit en capitales ou non
  it("gives the bytes of the image of that instant, the login in capitals or not", async () => {
    const { images, reads } = setup();

    expect(await images.get("Fenysk", AT)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(reads).toEqual([{ ownerId: "id-fenysk", at: AT }]);
  });

  // Si le login est inconnu, alors le système ne doit rendre aucune image ni lire de fichier
  it("gives nothing for an unknown login, and reads no file", async () => {
    const { images, reads } = setup();

    expect(await images.get("inconnu", AT)).toBeNull();
    expect(reads).toEqual([]);
  });

  // Si l'image du canvas n'est plus de cet instant (changée, retirée), alors le système ne doit rien rendre
  it("gives nothing when the image is no longer from that instant, changed or cleared", async () => {
    const { images } = setup();

    expect(await images.get("fenysk", AT - 1)).toBeNull();
  });
});

describe("le cache des images du fond", () => {
  // Quand la même image est demandée plusieurs fois, le système ne doit chercher le login et lire le fichier qu'une fois,
  // puis recommencer une fois la durée écoulée
  it("looks the login up and reads the file once while the cache lasts, then again once it is over", async () => {
    const { images, lookups, reads, advance } = setup();

    const first = await images.get("fenysk", AT);
    advance(BACKGROUND_IMAGE_KEPT_MS - 1);
    const second = await images.get("Fenysk", AT);
    advance(1);
    await images.get("fenysk", AT);

    expect(second).toBe(first);
    expect(reads).toHaveLength(2);
    expect(lookups).toHaveLength(2);
  });

  // Quand deux demandes arrivent ensemble, le système doit les servir d'une seule lecture
  it("serves two requests that arrive together from a single read", async () => {
    const { images, reads } = setup();

    const [first, second] = await Promise.all([images.get("fenysk", AT), images.get("fenysk", AT)]);

    expect(first).toBe(second);
    expect(reads).toHaveLength(1);
  });

  // Un refus ne se garde pas : l'image posée juste après est servie à la demande suivante
  it("keeps no refusal: an image set right after is served at the next request", async () => {
    const { images, state } = setup();
    state.currentAt = AT + 1;
    expect(await images.get("fenysk", AT + 1_000)).toBeNull();

    state.currentAt = AT + 1_000;

    expect(await images.get("fenysk", AT + 1_000)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  // Si Convex tombe pendant la lecture, alors le système doit laisser l'erreur remonter sans la garder
  it("lets a Convex failure rise and keeps nothing of it", async () => {
    const { images, state } = setup();
    state.failing = true;
    await expect(images.get("fenysk", AT)).rejects.toThrow("Convex down");

    state.failing = false;

    expect(await images.get("fenysk", AT)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  // Quand plus d'images que le plafond sont demandées, le système doit oublier les plus anciennes et garder les récentes
  it("forgets the oldest images once more than the cap were asked, and keeps the recent ones", async () => {
    const logins = Array.from({ length: MAX_CACHED_BACKGROUND_IMAGES + 1 }, (_, index) => `login${index}`);
    const { images, reads } = setup(logins);
    for (const login of logins) await images.get(login, AT);
    expect(reads).toHaveLength(logins.length);

    await images.get(logins[logins.length - 1] ?? "", AT);
    expect(reads).toHaveLength(logins.length);
    await images.get(logins[0] ?? "", AT);

    expect(reads).toHaveLength(logins.length + 1);
  });
});

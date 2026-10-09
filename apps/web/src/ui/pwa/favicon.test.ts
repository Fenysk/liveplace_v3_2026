import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Route as RootRoute } from "../../routes/__root";

// Écart §9.1 (JOURNAL 2026-10-08) : la pastille « LP » est l'icône de l'application et le favicon de toutes les pages.

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "..", "public");
const PNG_SIGNATURE = "89504e470d0a1a0a";

const getPublicFile = (name: string) => readFileSync(join(PUBLIC_DIR, name));

describe("le favicon (Écart §9.1, JOURNAL 2026-10-08)", () => {
  // Quand une page se charge, l'onglet montre la même icône que l'application, sans que le navigateur cherche /favicon.ico
  it("links the same icon on every page, from the root", async () => {
    const head = await RootRoute.options.head?.({} as never);

    expect(head?.links).toContainEqual({ rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" });
    expect(head?.links).toContainEqual({
      rel: "icon",
      type: "image/png",
      href: "/icon-192.png",
      sizes: "192x192",
    });
  });

  // /favicon.ico existe : un conteneur ICO de trois PNG (16, 32, 48), ce qu'un navigateur ou un robot lit sans balise
  it("serves a favicon.ico holding a 16, a 32 and a 48 PNG", () => {
    const ico = getPublicFile("favicon.ico");
    const count = ico.readUInt16LE(4);
    const images = Array.from({ length: count }, (_, index) => {
      const entry = 6 + 16 * index;
      const start = ico.readUInt32LE(entry + 12);
      const png = ico.subarray(start, start + ico.readUInt32LE(entry + 8));
      return {
        size: ico[entry],
        pngSignature: png.subarray(0, 8).toString("hex"),
        pngWidth: png.readUInt32BE(16),
      };
    });

    expect(ico.readUInt16LE(2)).toBe(1);
    expect(images).toEqual(
      [16, 32, 48].map((size) => ({ size, pngSignature: PNG_SIGNATURE, pngWidth: size })),
    );
  });

  // Les icônes « any » sont la pastille ronde sur fond transparent : un PNG avec canal alpha (type de couleur 6)
  it("keeps the round icons on a transparent background", () => {
    expect(getPublicFile("icon-192.png")[25]).toBe(6);
    expect(getPublicFile("icon-512.png")[25]).toBe(6);
  });
});

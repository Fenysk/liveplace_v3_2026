import { BACKGROUND_IMAGE_MAX_BYTES, BACKGROUND_IMAGE_MAX_SIDE } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { fitSide, type ImageCodec, prepareBackgroundImage } from "./background-image-file";

// Écart §9.1 (JOURNAL 2026-10-10) : l'image du fond est réduite (2048 px au plus), encodée en WebP, et refusée au-delà de 2 Mo,
// dans la page, avant d'être envoyée.

describe("fitSide", () => {
  // Quand le grand côté dépasse la borne, le système doit le ramener à la borne et garder les proportions
  it("brings the long side down to the bound and keeps the proportions", () => {
    expect(fitSide({ width: 4096, height: 2048 }, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(fitSide({ width: 3000, height: 6000 }, 2048)).toEqual({ width: 1024, height: 2048 });
    expect(fitSide({ width: 4000, height: 3000 }, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  // Une image qui tient déjà ne change pas de taille, et n'est jamais agrandie
  it("leaves an image that already fits at its size, and never enlarges it", () => {
    expect(fitSide({ width: 2048, height: 2048 }, 2048)).toEqual({ width: 2048, height: 2048 });
    expect(fitSide({ width: 640, height: 480 }, 2048)).toEqual({ width: 640, height: 480 });
  });

  // Une bande très étroite garde au moins un pixel de côté, jamais zéro
  it("keeps at least one pixel on the short side, never zero", () => {
    expect(fitSide({ width: 20_000, height: 3 }, 2048)).toEqual({ width: 2048, height: 1 });
  });
});

type Calls = { decoded: number; encoded: { width: number; height: number }[]; closed: number };

const codecOf = (
  decoded: { width: number; height: number } | "unreadable",
  encoded: { size: number; type: string } | null,
): { codec: ImageCodec; calls: Calls } => {
  const calls: Calls = { decoded: 0, encoded: [], closed: 0 };
  const codec: ImageCodec = {
    decode: async () => {
      calls.decoded += 1;
      if (decoded === "unreadable") throw new Error("pas une image");
      return {
        width: decoded.width,
        height: decoded.height,
        image: {} as CanvasImageSource,
        close: () => {
          calls.closed += 1;
        },
      };
    },
    encode: async (_image, size) => {
      calls.encoded.push(size);
      return encoded ? new Blob([new Uint8Array(encoded.size)], { type: encoded.type }) : null;
    },
  };
  return { codec, calls };
};

const png = new Blob([new Uint8Array(10)], { type: "image/png" });

describe("prepareBackgroundImage", () => {
  // Quand le fichier est une image lisible, le système doit l'encoder à la taille réduite, en WebP, et rendre le blob
  it("encodes a readable image at the reduced size, as a WebP, and hands the blob back", async () => {
    const { codec, calls } = codecOf({ width: 4096, height: 2048 }, { size: 300_000, type: "image/webp" });

    const result = await prepareBackgroundImage(png, codec);

    expect(result.ok && result.value.type).toBe("image/webp");
    expect(calls.encoded).toEqual([{ width: BACKGROUND_IMAGE_MAX_SIDE, height: 1024 }]);
    expect(calls.closed).toBe(1);
  });

  // Si le fichier n'est ni PNG, ni JPEG, ni WebP, alors le système doit le refuser sans le lire
  it("refuses a file that is not a PNG, a JPEG or a WebP, without reading it", async () => {
    const { codec, calls } = codecOf({ width: 10, height: 10 }, { size: 10, type: "image/webp" });

    for (const type of ["image/gif", "image/svg+xml", "application/pdf", ""]) {
      const result = await prepareBackgroundImage(new Blob([new Uint8Array(10)], { type }), codec);

      expect(result).toEqual({ ok: false, error: "unreadable" });
    }
    expect(calls.decoded).toBe(0);
  });

  // Si le navigateur ne sait pas lire le fichier, alors le système doit répondre `unreadable`
  it("answers unreadable when the browser cannot decode the file", async () => {
    const { codec, calls } = codecOf("unreadable", null);

    expect(await prepareBackgroundImage(png, codec)).toEqual({ ok: false, error: "unreadable" });
    expect(calls.encoded).toEqual([]);
  });

  // Si l'encodage ne rend pas du WebP (un navigateur qui ne l'encode pas), alors le système doit répondre `unsupported`
  it("answers unsupported when the encoding does not give a WebP, as in a browser that cannot encode it", async () => {
    const wrongType = codecOf({ width: 100, height: 100 }, { size: 5000, type: "image/png" });
    const nothing = codecOf({ width: 100, height: 100 }, null);

    expect(await prepareBackgroundImage(png, wrongType.codec)).toEqual({ ok: false, error: "unsupported" });
    expect(await prepareBackgroundImage(png, nothing.codec)).toEqual({ ok: false, error: "unsupported" });
    expect(wrongType.calls.closed).toBe(1);
  });

  // Si l'image encodée dépasse 2 Mo, alors le système doit répondre `too_big` ; 2 Mo pile passent
  it("answers too_big when the encoded image is over 2 MB, and lets exactly 2 MB through", async () => {
    const over = codecOf(
      { width: 2000, height: 2000 },
      { size: BACKGROUND_IMAGE_MAX_BYTES + 1, type: "image/webp" },
    );
    const exact = codecOf(
      { width: 2000, height: 2000 },
      { size: BACKGROUND_IMAGE_MAX_BYTES, type: "image/webp" },
    );

    expect(await prepareBackgroundImage(png, over.codec)).toEqual({ ok: false, error: "too_big" });
    expect((await prepareBackgroundImage(png, exact.codec)).ok).toBe(true);
    expect(over.calls.closed).toBe(1);
  });
});

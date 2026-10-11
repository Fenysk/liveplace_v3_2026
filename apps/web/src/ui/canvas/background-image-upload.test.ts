import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBackgroundImage } from "./background-image-upload";

// Écart §9.1 (JOURNAL 2026-10-10) : la page poste l'image du fond au web, à son adresse : jamais à Convex, que la CSP n'ouvre pas.

afterEach(() => vi.restoreAllMocks());

const image = new Blob([new Uint8Array(8)], { type: "image/webp" });

const replying =
  (status: number, body: unknown) =>
  (...args: Parameters<typeof fetch>): Promise<Response> => {
    sent.push(args);
    return Promise.resolve(Response.json(body, { status }));
  };

const sent: Parameters<typeof fetch>[] = [];

describe("uploadBackgroundImage", () => {
  // Quand le web répond que l'image est rangée, le système doit réussir, après un POST à l'adresse du pseudo, canvas visé en paramètre
  it("succeeds when the web answers that the image is stored, after a POST to the address of the login, the canvas in a parameter", async () => {
    sent.length = 0;

    const result = await uploadBackgroundImage(
      { login: "fenysk", canvasId: "canvas-a", image },
      replying(200, { ok: true }),
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sent).toHaveLength(1);
    const [url, init] = sent[0] ?? [];
    expect(url).toBe("/fenysk/background?canvas=canvas-a");
    expect(init).toMatchObject({ method: "POST", body: image, credentials: "same-origin" });
  });

  // Un pseudo ou un identifiant de canvas ne sortent jamais de leur place dans l'adresse
  it("never lets a login or a canvas id out of its place in the address", async () => {
    sent.length = 0;

    await uploadBackgroundImage({ login: "a/b", canvasId: "c&d=e", image }, replying(200, { ok: true }));

    expect(sent[0]?.[0]).toBe("/a%2Fb/background?canvas=c%26d%3De");
  });

  // Quand le web refuse, le système doit rendre la raison qu'il donne, parmi celles qu'il connaît
  it("gives the reason the web gives for a refusal, among those it knows", async () => {
    for (const error of [
      "too_big",
      "invalid_image",
      "not_active",
      "unauthenticated",
      "bad_request",
      "failed",
    ]) {
      const result = await uploadBackgroundImage(
        { login: "fenysk", canvasId: "canvas-a", image },
        replying(409, { ok: false, error }),
      );

      expect(result).toEqual({ ok: false, error });
    }
  });

  // Une réponse que la page ne comprend pas (une page d'erreur, une raison inconnue) est un échec, jamais un succès
  it("takes an answer it does not understand as a failure, never a success", async () => {
    const garbled = [
      replying(502, { nope: true }),
      replying(500, { ok: false, error: "inconnue" }),
      (...args: Parameters<typeof fetch>) => {
        sent.push(args);
        return Promise.resolve(new Response("<html>Bad gateway</html>", { status: 502 }));
      },
    ];

    for (const reply of garbled) {
      const result = await uploadBackgroundImage({ login: "fenysk", canvasId: "canvas-a", image }, reply);

      expect(result).toEqual({ ok: false, error: "failed" });
    }
  });

  // Quand le réseau tombe, le système doit répondre `network`, et journaliser l'erreur avec son contexte
  it("answers network when the network fails, and logs the error with its context", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await uploadBackgroundImage({ login: "fenysk", canvasId: "canvas-a", image }, () =>
      Promise.reject(new Error("offline")),
    );

    expect(result).toEqual({ ok: false, error: "network" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("image du fond"), expect.any(Error));
  });
});

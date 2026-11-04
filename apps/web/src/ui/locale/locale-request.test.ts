import { afterEach, describe, expect, it, vi } from "vitest";
import { getSavedLocale, saveLocale } from "./locale-request";

afterEach(() => {
  vi.restoreAllMocks();
});

const sendOf = (response: Response | Error) => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { send, sent };
};

describe("saveLocale (JOURNAL 2026-11-04)", () => {
  // Un POST JSON à la route, avec les cookies du site, qui porte la langue choisie
  it("posts the picked language as JSON to the route", async () => {
    const { send, sent } = sendOf(new Response('{"ok":true,"locale":"en"}'));

    await saveLocale("en", send);

    expect(sent).toEqual([
      {
        url: "/auth/locale",
        init: {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: '{"locale":"en"}',
        },
      },
    ]);
  });

  // Un refus ou une panne du réseau ne casse pas la page : la langue tient pour elle, et la console le dit
  it("does not break the page when the server refuses or does not answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(saveLocale("en", sendOf(new Response("{}", { status: 403 })).send)).resolves.toBeUndefined();
    await expect(saveLocale("en", sendOf(new Error("hors ligne")).send)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("getSavedLocale (JOURNAL 2026-11-04)", () => {
  // Un GET sans cache : une réponse reprise du cache dirait la langue d'avant
  it("asks the route without any cache and gives the language it answers", async () => {
    const { send, sent } = sendOf(Response.json({ ok: true, locale: "fr" }));

    expect(await getSavedLocale(send)).toBe("fr");

    expect(sent).toEqual([{ url: "/auth/locale", init: { credentials: "same-origin", cache: "no-store" } }]);
  });

  // Sans langue retenue, avec une langue inconnue, un corps illisible ou sans réponse : aucune langue, la page garde la sienne
  it("gives nothing when the server has no language, an unknown one, or does not answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await getSavedLocale(sendOf(Response.json({ ok: true, locale: null })).send)).toBeUndefined();
    expect(await getSavedLocale(sendOf(Response.json({ ok: true, locale: "de" })).send)).toBeUndefined();
    expect(await getSavedLocale(sendOf(new Response("pas du JSON")).send)).toBeUndefined();
    expect(await getSavedLocale(sendOf(new Error("hors ligne")).send)).toBeUndefined();
  });
});

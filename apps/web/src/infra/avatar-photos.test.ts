import { describe, expect, it } from "vitest";
import { TWITCH_AVATAR_ORIGIN } from "../shared/twitch-avatar-origin";
import {
  AVATAR_FAILED_RETRY_MS,
  AVATAR_KEPT_MS,
  createAvatarPhotos,
  MAX_AVATAR_BYTES,
  MAX_CACHED_AVATARS,
} from "./avatar-photos";

const URL_OK = `${TWITCH_AVATAR_ORIGIN}/jtv_user_pictures/abc-profile_image-300x300.png`;
const PHOTO = Uint8Array.from([1, 2, 3, 4]);

const imageResponse = (bytes: Uint8Array<ArrayBuffer> = PHOTO, type = "image/png"): Response =>
  new Response(bytes, { status: 200, headers: { "content-type": type } });

const setup = (answer: (url: string) => Response | Promise<Response> = () => imageResponse()) => {
  const calls: { url: string; init: RequestInit }[] = [];
  let nowMs = 1_000;
  const photos = createAvatarPhotos({
    fetchPhoto: async (url, init) => {
      calls.push({ url, init });
      return answer(url);
    },
    now: () => nowMs,
  });
  const advance = (ms: number): void => {
    nowMs += ms;
  };
  return { photos, calls, advance };
};

describe("la photo de profil d'un streamer", () => {
  // Quand l'adresse est celle d'une photo du CDN de Twitch, le système doit rendre la photo en data URI de son type
  it("gives the photo of the Twitch CDN as a data URI of its type", async () => {
    const { photos } = setup();

    expect(await photos.get(URL_OK)).toBe("data:image/png;base64,AQIDBA==");
  });

  // Si l'adresse n'est pas une photo du CDN de Twitch en https, alors le système ne doit rien demander à personne
  it("asks nobody when the address is not a photo of the Twitch CDN over https", async () => {
    const { photos, calls } = setup();

    for (const url of [
      "https://example.com/photo.png",
      "http://static-cdn.jtvnw.net/photo.png",
      "https://static-cdn.jtvnw.net.evil.example/photo.png",
      "https://static-cdn.jtvnw.net@evil.example/photo.png",
      "not an address",
      "",
    ])
      expect(await photos.get(url)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  // Quand la photo est demandée, le système ne doit suivre aucune redirection et ne pas attendre sans fin
  it("follows no redirect and does not wait forever", async () => {
    const { photos, calls } = setup();

    await photos.get(URL_OK);

    expect(calls[0]?.init.redirect).toBe("error");
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  // Si la réponse n'est pas une petite image reconnue, ou que la demande échoue, alors le système doit rendre `null`
  it("gives null when the answer is not a small known image, or the request fails", async () => {
    const answers: Record<string, () => Response | Promise<Response>> = {
      missing: () => new Response(null, { status: 404 }),
      page: () => imageResponse(PHOTO, "text/html"),
      vector: () => imageResponse(PHOTO, "image/svg+xml"),
      huge: () => imageResponse(new Uint8Array(MAX_AVATAR_BYTES + 1)),
      down: () => Promise.reject(new Error("réseau")),
    };

    for (const answer of Object.values(answers)) expect(await setup(answer).photos.get(URL_OK)).toBeNull();
  });

  // Quand la photo est redemandée avant l'heure, le système doit la rendre sans la redemander, puis la redemander après
  it("serves a photo again without asking for it before its time, and asks again after", async () => {
    const { photos, calls, advance } = setup();

    await photos.get(URL_OK);
    advance(AVATAR_KEPT_MS - 1);
    await photos.get(URL_OK);
    advance(1);
    await photos.get(URL_OK);

    expect(calls).toHaveLength(2);
  });

  // Quand deux rendus demandent la même photo ensemble, le système ne doit la demander qu'une fois
  it("asks only once when two renders ask for the same photo together", async () => {
    const { photos, calls } = setup();

    const [first, second] = await Promise.all([photos.get(URL_OK), photos.get(URL_OK)]);

    expect(first).toBe(second);
    expect(calls).toHaveLength(1);
  });

  // Si la photo n'a pas chargé, alors le système ne doit pas la redemander avant le répit, puis il doit réessayer
  it("does not ask again for a photo that failed before the pause is over, then tries again", async () => {
    let isUp = false;
    const { photos, calls, advance } = setup(() =>
      isUp ? imageResponse() : new Response(null, { status: 503 }),
    );

    expect(await photos.get(URL_OK)).toBeNull();
    isUp = true;
    advance(AVATAR_FAILED_RETRY_MS - 1);
    expect(await photos.get(URL_OK)).toBeNull();
    advance(1);

    expect(await photos.get(URL_OK)).toBe("data:image/png;base64,AQIDBA==");
    expect(calls).toHaveLength(2);
  });

  // Quand plus de photos que le plafond sont demandées, le système doit oublier les plus anciennes
  it("forgets the oldest photos once more than the cap were asked", async () => {
    const { photos, calls } = setup();
    const urls = Array.from({ length: MAX_CACHED_AVATARS + 1 }, (_, index) => `${URL_OK}?n=${index}`);
    for (const url of urls) await photos.get(url);
    expect(calls).toHaveLength(urls.length);

    await photos.get(urls[urls.length - 1] ?? "");
    expect(calls).toHaveLength(urls.length);
    await photos.get(urls[0] ?? "");

    expect(calls).toHaveLength(urls.length + 1);
  });
});

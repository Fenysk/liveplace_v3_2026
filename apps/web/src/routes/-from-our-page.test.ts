import { describe, expect, it } from "vitest";
import { isFromOurPageCall } from "./-from-our-page";

const contextOf = (publicUrl: string) => ({ deps: { publicUrl } });
const call = (origin?: string): Request =>
  new Request("https://liveplace.test/_serverFn/x", { method: "POST", headers: origin ? { origin } : {} });

describe("isFromOurPageCall (audit de sécurité n°10, JOURNAL 2026-11-21)", () => {
  // Un appel de notre page porte l'origine du site : il passe
  it("accepts a call that carries the origin of the site", () => {
    expect(isFromOurPageCall(call("https://liveplace.tv"), contextOf("https://liveplace.tv"))).toBe(true);
  });

  // Une bêta accepte sa propre origine, pas celle de la prod ni d'une autre bêta
  it("accepts the origin of its own environment only", () => {
    const beta = contextOf("https://beta3.liveplace.tv");

    expect(isFromOurPageCall(call("https://beta3.liveplace.tv"), beta)).toBe(true);
    expect(isFromOurPageCall(call("https://liveplace.tv"), beta)).toBe(false);
    expect(isFromOurPageCall(call("https://beta2.liveplace.tv"), beta)).toBe(false);
  });

  // Une autre origine, une origine opaque ou l'absence d'en-tête sont refusées
  it("refuses a foreign origin, an opaque one and a missing header", () => {
    const site = contextOf("https://liveplace.tv");

    for (const origin of ["https://evil.example", "https://liveplace.tv.evil.example", "null", undefined])
      expect(isFromOurPageCall(call(origin), site)).toBe(false);
  });

  // Sans adresse du site dans le contexte, tout est refusé : jamais d'ouverture par défaut
  it("refuses everything when the context carries no site address", () => {
    for (const context of [undefined, {}, { deps: {} }, { deps: { publicUrl: 3 } }])
      expect(isFromOurPageCall(call("https://liveplace.tv"), context)).toBe(false);
  });
});

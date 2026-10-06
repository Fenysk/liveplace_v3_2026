import { describe, expect, it } from "vitest";
import { isAllowedOrigin, toDevice } from "./ws-server";

const publicOrigin = "https://liveplace.tv";

describe("isAllowedOrigin (audit de sécurité §4, JOURNAL 2026-09-29)", () => {
  // Une page du site ouvre le WebSocket
  it("accepts the public origin", () => {
    expect(isAllowedOrigin("https://liveplace.tv", publicOrigin)).toBe(true);
  });

  // Une page d'ailleurs est refusée : autre site, autre schéma, sous-domaine, origine opaque
  it("refuses every other origin", () => {
    for (const origin of [
      "https://evil.example",
      "http://liveplace.tv",
      "https://www.liveplace.tv",
      "https://liveplace.tv.evil.example",
      "null",
    ])
      expect(isAllowedOrigin(origin, publicOrigin)).toBe(false);
  });

  // Sans `Origin`, ce n'est pas un navigateur : les bots des preuves et le test de charge passent
  it("accepts a handshake without Origin", () => {
    expect(isAllowedOrigin(undefined, publicOrigin)).toBe(true);
  });
});

describe("toDevice (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Lit un téléphone au User-Agent d'un mobile, un PC sinon, et sans User-Agent
  it("reads a phone in a mobile User-Agent, a desktop otherwise and without one", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const android =
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
    const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

    expect(toDevice(iphone)).toBe("phone");
    expect(toDevice(android)).toBe("phone");
    expect(toDevice(windows)).toBe("desktop");
    expect(toDevice(undefined)).toBe("desktop");
  });
});

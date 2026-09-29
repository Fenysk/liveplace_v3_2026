import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./ws-server";

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

import { describe, expect, it } from "vitest";
import { parseWebConfig } from "./config";

const sessionSecret = "s".repeat(32);
const env = {
  PUBLIC_URL: "https://liveplace.tv",
  SESSION_SECRET: sessionSecret,
  TWITCH_CLIENT_ID: "client-id",
  TWITCH_CLIENT_SECRET: "client-secret",
  CONVEX_URL: "https://example.convex.cloud",
  CONVEX_SERVICE_KEY: "service-key",
  REDIS_URL: "redis://127.0.0.1:6379",
};

// Le message de l'erreur levée, ou l'échec du test si rien n'est levé.
const messageOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("aucune erreur levée");
};

describe("parseWebConfig (§11.5)", () => {
  // Nomme chaque variable obligatoire absente
  it("names every missing required variable", () => {
    const { TWITCH_CLIENT_SECRET: _, CONVEX_SERVICE_KEY: __, ...incomplete } = env;

    const message = messageOf(() => parseWebConfig(incomplete));

    expect(message).toContain("TWITCH_CLIENT_SECRET");
    expect(message).toContain("CONVEX_SERVICE_KEY");
  });

  // Refuse un secret trop court sans jamais écrire sa valeur (§10.2)
  it("refuses a secret shorter than 32 bytes without printing its value", () => {
    const tooShort = "secret-de-dev";

    const message = messageOf(() => parseWebConfig({ ...env, SESSION_SECRET: tooShort }));

    expect(message).toContain("SESSION_SECRET");
    expect(message).not.toContain(tooShort);
  });

  // Retire la barre finale de PUBLIC_URL : le redirect Twitch doit correspondre octet pour octet
  it("strips the trailing slash of PUBLIC_URL: the Twitch redirect must match byte for byte", () => {
    expect(parseWebConfig({ ...env, PUBLIC_URL: "https://liveplace.tv/" }).publicUrl).toBe(
      "https://liveplace.tv",
    );
  });
});

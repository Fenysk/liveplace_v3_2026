import { describe, expect, it } from "vitest";
import { parseGatewayConfig } from "./config";

const sessionSecret = "s".repeat(32);
const env = {
  REDIS_URL: "redis://127.0.0.1:6379",
  SESSION_SECRET: sessionSecret,
  PUBLIC_URL: "https://liveplace.tv",
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

describe("parseGatewayConfig (§11.5)", () => {
  // Nomme la variable obligatoire absente
  it("names the missing required variable", () => {
    expect(messageOf(() => parseGatewayConfig({ REDIS_URL: env.REDIS_URL }))).toContain("SESSION_SECRET");
  });

  // Refuse un secret trop court sans jamais écrire sa valeur (§10.2)
  it("refuses a secret shorter than 32 bytes without printing its value", () => {
    const tooShort = "secret-de-dev";

    const message = messageOf(() => parseGatewayConfig({ ...env, SESSION_SECRET: tooShort }));

    expect(message).toContain("SESSION_SECRET");
    expect(message).not.toContain(tooShort);
  });

  // Applique le défaut de BROADCAST_HZ quand la variable est absente (D-13)
  it("defaults BROADCAST_HZ to 10", () => {
    expect(parseGatewayConfig(env)).toEqual({
      redisUrl: env.REDIS_URL,
      sessionSecret,
      broadcastHz: 10,
      publicOrigin: "https://liveplace.tv",
    });
  });

  // Nomme PUBLIC_URL absente, et n'en garde que l'origine : celle d'où une page ouvre le WebSocket (JOURNAL 2026-09-29)
  it("requires PUBLIC_URL and keeps only its origin", () => {
    const { PUBLIC_URL: _, ...withoutUrl } = env;

    expect(messageOf(() => parseGatewayConfig(withoutUrl))).toContain("PUBLIC_URL");
    expect(parseGatewayConfig({ ...env, PUBLIC_URL: "https://liveplace.tv/" }).publicOrigin).toBe(
      "https://liveplace.tv",
    );
  });
});

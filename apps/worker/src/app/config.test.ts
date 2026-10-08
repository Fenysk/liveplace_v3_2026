import { describe, expect, it } from "vitest";
import { parseWorkerConfig } from "./config";

const serviceKey = "k".repeat(40);
const env = {
  REDIS_URL: "redis://127.0.0.1:6379",
  CONVEX_URL: "https://watchful-spider-409.eu-west-1.convex.cloud",
  CONVEX_SERVICE_KEY: serviceKey,
  DURABLE_SCOPE: "poste-2",
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

describe("parseWorkerConfig (§11.5, Écart §11.5 JOURNAL 2026-10-06)", () => {
  // Nomme la variable obligatoire absente
  it("names the missing required variable", () => {
    const { REDIS_URL: _redisUrl, ...withoutRedis } = env;

    expect(messageOf(() => parseWorkerConfig(withoutRedis))).toContain("REDIS_URL");
  });

  // Le scope n'a aucun défaut : sans lui, le worker refuse de démarrer plutôt que de mélanger deux environnements
  it("refuses to start without a scope, instead of mixing two environments", () => {
    const { DURABLE_SCOPE: _scope, ...withoutScope } = env;

    expect(messageOf(() => parseWorkerConfig(withoutScope))).toContain("DURABLE_SCOPE");
  });

  // Un scope en minuscules, chiffres et tirets : il entre dans une ligne d'index et dans un nom lisible
  it("refuses a scope that is not lowercase letters, digits and dashes", () => {
    expect(messageOf(() => parseWorkerConfig({ ...env, DURABLE_SCOPE: "Prod" }))).toContain("DURABLE_SCOPE");
    expect(messageOf(() => parseWorkerConfig({ ...env, DURABLE_SCOPE: "poste 2" }))).toContain(
      "DURABLE_SCOPE",
    );
    expect(messageOf(() => parseWorkerConfig({ ...env, DURABLE_SCOPE: "" }))).toContain("DURABLE_SCOPE");
  });

  // Ne dit jamais la valeur de la clé du service dans l'erreur
  it("never prints the service key in an error", () => {
    const message = messageOf(() => parseWorkerConfig({ ...env, DURABLE_SCOPE: "Prod" }));

    expect(message).not.toContain(serviceKey);
  });

  // Le scope nommé est gardé tel quel
  it("keeps the named scope", () => {
    expect(parseWorkerConfig(env)).toEqual({
      redisUrl: env.REDIS_URL,
      convexUrl: env.CONVEX_URL,
      convexServiceKey: serviceKey,
      scope: "poste-2",
    });
  });

  // `off` écrit exprès : le worker démarre sans rien sauvegarder, son scope est `null`
  it("reads an explicit off as no scope at all", () => {
    expect(parseWorkerConfig({ ...env, DURABLE_SCOPE: "off" }).scope).toBeNull();
  });
});

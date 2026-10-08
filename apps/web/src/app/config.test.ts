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
  TWITCH_EVENTSUB_SECRET: "e".repeat(32),
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

  // Refuse un secret EventSub hors de 10 à 100 caractères, les bornes de Twitch (JOURNAL 2026-09-27)
  it("refuses an EventSub secret outside Twitch's 10 to 100 characters", () => {
    expect(messageOf(() => parseWebConfig({ ...env, TWITCH_EVENTSUB_SECRET: "e".repeat(9) }))).toContain(
      "TWITCH_EVENTSUB_SECRET",
    );
    expect(messageOf(() => parseWebConfig({ ...env, TWITCH_EVENTSUB_SECRET: "e".repeat(101) }))).toContain(
      "TWITCH_EVENTSUB_SECRET",
    );
    expect(parseWebConfig(env).twitchEventSubSecret).toBe(env.TWITCH_EVENTSUB_SECRET);
  });

  // Refuse un secret trop court sans jamais écrire sa valeur (§10.2)
  it("refuses a secret shorter than 32 bytes without printing its value", () => {
    const tooShort = "secret-de-dev";

    const message = messageOf(() => parseWebConfig({ ...env, SESSION_SECRET: tooShort }));

    expect(message).toContain("SESSION_SECRET");
    expect(message).not.toContain(tooShort);
  });

  // Lit l'étiquette d'un emplacement de bêta ; absente ou vide, c'est la production (JOURNAL 2026-10-04)
  it("reads a beta slot's label, and treats it missing or empty as production", () => {
    expect(parseWebConfig({ ...env, BETA_LABEL: "feat/adsense" }).betaLabel).toBe("feat/adsense");
    expect(parseWebConfig({ ...env, BETA_LABEL: "" }).betaLabel).toBeNull();
    expect(parseWebConfig(env).betaLabel).toBeNull();
  });

  // Retire la barre finale de PUBLIC_URL : le redirect Twitch doit correspondre octet pour octet
  it("strips the trailing slash of PUBLIC_URL: the Twitch redirect must match byte for byte", () => {
    expect(parseWebConfig({ ...env, PUBLIC_URL: "https://liveplace.tv/" }).publicUrl).toBe(
      "https://liveplace.tv",
    );
  });
});

// Écart §2 et §9 (JOURNAL 2026-10-07) : les déploiements Convex dont le web lit l'usage, facultatifs.
describe("CONVEX_USAGE_DEPLOYMENTS (JOURNAL 2026-10-07)", () => {
  const prod = "https://watchful-spider-409.eu-west-1.convex.cloud";
  const dev = "https://happy-otter-123.convex.cloud";

  // Absente, vide ou faite d'espaces : aucun déploiement, donc Convex « non configuré »
  it("is no deployment when missing, empty or made of spaces: Convex is then not configured", () => {
    expect(parseWebConfig(env).convexUsageDeployments).toEqual([]);
    expect(parseWebConfig({ ...env, CONVEX_USAGE_DEPLOYMENTS: "" }).convexUsageDeployments).toEqual([]);
    expect(parseWebConfig({ ...env, CONVEX_USAGE_DEPLOYMENTS: "  \n " }).convexUsageDeployments).toEqual([]);
  });

  // Lit des paires « URL clé » séparées par des espaces, et nomme chaque déploiement par le premier mot de son hôte
  it("reads pairs of URL and key separated by whitespace, and names each deployment by the first word of its host", () => {
    const raw = `${prod} prod:watchful-spider-409|abc123  ${dev}\tdev:happy-otter-123|def456\n`;

    expect(parseWebConfig({ ...env, CONVEX_USAGE_DEPLOYMENTS: raw }).convexUsageDeployments).toEqual([
      { name: "watchful-spider-409", url: prod, key: "prod:watchful-spider-409|abc123" },
      { name: "happy-otter-123", url: dev, key: "dev:happy-otter-123|def456" },
    ]);
  });

  // Refuse une paire incomplète, une URL qui n'est pas en https, ou deux fois le même déploiement, en nommant la variable seule
  it("refuses an incomplete pair, a URL that is not https, or the same deployment twice, naming only the variable", () => {
    const key = "prod:secret-key|do-not-print";
    for (const raw of [
      `${prod}`,
      `${prod} ${key} ${dev}`,
      `http://x.convex.cloud ${key}`,
      `${prod} ${key} ${prod} ${key}`,
    ]) {
      const message = messageOf(() => parseWebConfig({ ...env, CONVEX_USAGE_DEPLOYMENTS: raw }));

      expect(message).toContain("CONVEX_USAGE_DEPLOYMENTS");
      expect(message).not.toContain("do-not-print");
      expect(message).not.toContain("watchful-spider");
    }
  });
});

describe("DURABLE_SCOPE (JOURNAL 2026-10-08)", () => {
  // Absente, vide ou `off` : le web se comporte comme avant, la connexion crée le canvas sans rien demander à Convex
  it("is no scope when missing, empty or off", () => {
    expect(parseWebConfig(env).durableScope).toBeNull();
    expect(parseWebConfig({ ...env, DURABLE_SCOPE: "" }).durableScope).toBeNull();
    expect(parseWebConfig({ ...env, DURABLE_SCOPE: "off" }).durableScope).toBeNull();
  });

  // Un nom d'environnement valide est gardé tel quel : c'est celui du worker
  it("keeps a valid environment name as it is", () => {
    expect(parseWebConfig({ ...env, DURABLE_SCOPE: "poste-2" }).durableScope).toBe("poste-2");
    expect(parseWebConfig({ ...env, DURABLE_SCOPE: "prod" }).durableScope).toBe("prod");
  });

  // Un nom que le worker refuserait est refusé aussi, en nommant la variable
  it("refuses a name the worker would refuse, naming the variable", () => {
    expect(messageOf(() => parseWebConfig({ ...env, DURABLE_SCOPE: "Prod" }))).toContain("DURABLE_SCOPE");
    expect(messageOf(() => parseWebConfig({ ...env, DURABLE_SCOPE: "poste 2" }))).toContain("DURABLE_SCOPE");
  });
});

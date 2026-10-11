import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import setup, {
  DOCKER_DOWN_MESSAGE,
  listOrphans,
  parseContainers,
  sweepOrphans,
  TEST_REDIS_IMAGE,
  TEST_REDIS_LABEL,
  type TestContainer,
} from "./test-global-setup";

const now = 1_700_000_000_000;
const MINUTE = 60_000;
const container = (id: string, ageMs: number): TestContainer => ({
  id,
  creatorPid: 100,
  createdAt: now - ageMs,
});
const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8" }).stdout.trim();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Redis each test launch starts for itself (JOURNAL 2026-10-11)", () => {
  // Un lancement tué n'a pas pu arrêter son Redis : le suivant le retire dès que son créateur est mort
  it("counts a test Redis whose creator is dead as an orphan, however young", () => {
    const young = container("young", MINUTE);

    expect(listOrphans([young], now, () => false)).toEqual([young]);
  });

  // Un lancement en cours garde son Redis
  it("keeps the test Redis of a creator that is still alive", () => {
    expect(listOrphans([container("running", 5 * MINUTE)], now, () => true)).toEqual([]);
  });

  // Un pid réutilisé par un autre processus ferait vivre un orphelin pour toujours : 30 min le retirent
  it("counts a test Redis older than 30 minutes as an orphan even when its creator pid answers", () => {
    const stale = container("stale", 31 * MINUTE);

    expect(listOrphans([stale, container("recent", 29 * MINUTE)], now, () => true)).toEqual([stale]);
  });

  // Les lignes de `docker ps` donnent l'identifiant, le créateur et l'heure ; ce qui n'est pas à nous est laissé
  it("reads the rows of docker ps and leaves out what does not carry our label", () => {
    const listing = [
      `abc123 ${TEST_REDIS_LABEL}=4242:1700000000000`,
      "def456 maintainer=someone",
      `0f9e8d other=1,${TEST_REDIS_LABEL}=77:1700000060000,more=2`,
    ].join("\n");

    expect(parseContainers(listing)).toEqual([
      { id: "abc123", creatorPid: 4242, createdAt: 1_700_000_000_000 },
      { id: "0f9e8d", creatorPid: 77, createdAt: 1_700_000_060_000 },
    ]);
  });

  // Docker arrêté : le lancement s'arrête tout de suite sur ce qu'il faut faire, sans repli vers le Redis de dev
  it("stops at once with a message that says to start Docker Desktop when the Docker daemon is down", async () => {
    vi.stubEnv("DOCKER_HOST", "tcp://127.0.0.1:1");
    const provide = vi.fn();

    await expect(setup({ provide })).rejects.toThrow(DOCKER_DOWN_MESSAGE);
    expect(provide).not.toHaveBeenCalled();
  });

  // Docker absent : même message
  it("stops with the same message when the docker command does not exist", async () => {
    vi.stubEnv("PATH", "");
    const provide = vi.fn();

    await expect(setup({ provide })).rejects.toThrow(DOCKER_DOWN_MESSAGE);
    expect(provide).not.toHaveBeenCalled();
  });

  // Les tests parlent au Redis que leur lancement a démarré : un conteneur étiqueté, jamais le Redis de dev du port 6379
  it("talks to a labelled Redis container of its own, never to the dev Redis on 6379", () => {
    const port = inject("redisPort");

    expect(port).not.toBe(6379);
    expect(docker("ps", "--filter", `label=${TEST_REDIS_LABEL}`, "--format", "{{.Ports}}")).toContain(
      `127.0.0.1:${port}->6379/tcp`,
    );
  });

  // Le ménage retire le Redis d'un créateur mort et laisse celui de ce lancement : seul un orphelin part.
  // Vrais conteneurs : chaque commande Docker coûte ~0,4 s, d'où un délai propre à ce test (jamais celui de Vitest).
  it("removes the test Redis of a dead creator and keeps the one of this launch", { timeout: 30_000 }, () => {
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    const orphan = docker("create", "--label", `${TEST_REDIS_LABEL}=${dead}:${Date.now()}`, TEST_REDIS_IMAGE);

    sweepOrphans();

    const containers = docker("ps", "-a", "--no-trunc", "--format", "{{.ID}} {{.Ports}}");
    expect(containers).not.toContain(orphan);
    expect(containers).toContain(`127.0.0.1:${inject("redisPort")}->6379/tcp`);
  });
});

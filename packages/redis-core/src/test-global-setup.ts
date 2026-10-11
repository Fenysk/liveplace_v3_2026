import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Redis } from "ioredis";
import type { TestProject } from "vitest/node";

// Un Redis par lancement de Vitest (JOURNAL 2026-10-11) : démarré ici dans Docker, son port rendu aux tests par `inject("redisPort")`.
declare module "vitest" {
  interface ProvidedContext {
    redisPort: number;
  }
}

export const TEST_REDIS_LABEL = "liveplace.test-redis";
export const TEST_REDIS_IMAGE = "redis:7-alpine"; // celle de docker-compose.dev.yml
export const DOCKER_DOWN_MESSAGE =
  "Docker est absent ou arrêté : chaque lancement des tests démarre son propre Redis dans Docker. Démarrer Docker Desktop, attendre qu'il soit prêt, puis relancer les tests.";

const MAX_AGE_MS = 30 * 60_000;
const READY_TIMEOUT_MS = 20_000;
const ROW = new RegExp(`^(\\S+)\\s.*${TEST_REDIS_LABEL.replaceAll(".", "\\.")}=(\\d+):(\\d+)`);

export type TestContainer = { id: string; creatorPid: number; createdAt: number };

const docker = (args: readonly string[]) => spawnSync("docker", args, { encoding: "utf8" });

// Signal 0 : teste l'existence du processus. EPERM = il existe, mais n'est pas à nous.
const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

// Orphelin : son créateur est mort, ou il a plus de 30 min (un pid réutilisé le ferait vivre pour toujours).
export const listOrphans = (
  containers: readonly TestContainer[],
  now: number,
  isAlive: (pid: number) => boolean,
): TestContainer[] =>
  containers.filter(({ creatorPid, createdAt }) => !isAlive(creatorPid) || now - createdAt > MAX_AGE_MS);

// Une ligne de `docker ps --format "{{.ID}} {{.Labels}}"` ; le créateur et l'heure sont dans la valeur de notre étiquette.
export const parseContainers = (listing: string): TestContainer[] =>
  listing.split("\n").flatMap((row) => {
    const [, id, creatorPid, createdAt] = ROW.exec(row) ?? [];
    return id && creatorPid && createdAt
      ? [{ id, creatorPid: Number(creatorPid), createdAt: Number(createdAt) }]
      : [];
  });

// Ne retire que ce que l'étiquette désigne : aucun autre conteneur, `liveplace-dev-redis` en tête.
export function sweepOrphans(): void {
  const listing = docker([
    "ps",
    "-a",
    "--filter",
    `label=${TEST_REDIS_LABEL}`,
    "--format",
    "{{.ID}} {{.Labels}}",
  ]);
  if (listing.status !== 0)
    throw new Error(`${DOCKER_DOWN_MESSAGE}\n${(listing.error?.message ?? listing.stderr).trim()}`);
  const orphans = listOrphans(parseContainers(listing.stdout), Date.now(), isProcessAlive);
  if (orphans.length > 0) docker(["rm", "-f", ...orphans.map(({ id }) => id)]);
}

// Port publié sur 127.0.0.1 seulement (`localhost` peut tomber sur wslrelay en IPv6), choisi libre par Docker.
const startContainer = (): { id: string; port: number } => {
  const label = `${TEST_REDIS_LABEL}=${process.pid}:${Date.now()}`;
  const started = docker([
    ...["run", "-d", "--rm", "--name", `liveplace-test-redis-${randomBytes(3).toString("hex")}`],
    ...["--label", label, "-p", "127.0.0.1::6379", TEST_REDIS_IMAGE],
    ...[
      "redis-server",
      "--save",
      "",
      "--appendonly",
      "no",
      "--maxmemory",
      "256mb",
      "--maxmemory-policy",
      "noeviction",
    ],
  ]);
  if (started.status !== 0) throw new Error(`Le Redis de test n'a pas démarré : ${started.stderr.trim()}`);
  const id = started.stdout.trim();
  const port = Number(/:(\d+)\s*$/m.exec(docker(["port", id, "6379/tcp"]).stdout)?.[1]);
  if (!Number.isInteger(port)) {
    docker(["rm", "-f", id]);
    throw new Error(`Le Redis de test ${id} n'a pas de port publié`);
  }
  return { id, port };
};

// Docker publie le port avant que Redis réponde : on réessaie jusqu'à un PONG.
const waitUntilAnswers = async (port: number): Promise<void> => {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const probe = new Redis({ host: "127.0.0.1", port, lazyConnect: true, retryStrategy: () => null });
    probe.on("error", () => undefined); // l'échec remonte par `connect()`
    try {
      await probe.connect();
      await probe.ping();
      return;
    } catch (error) {
      if (Date.now() > deadline)
        throw new Error(`Le Redis de test ne répond pas sur le port ${port}`, { cause: error });
      await delay(100);
    } finally {
      probe.disconnect();
    }
  }
};

export default async function setup(project: Pick<TestProject, "provide">): Promise<() => void> {
  sweepOrphans();
  const { id, port } = startContainer();
  const stop = () => {
    docker(["rm", "-f", id]);
  };
  try {
    await waitUntilAnswers(port);
  } catch (error) {
    stop();
    throw error;
  }
  project.provide("redisPort", port);
  // Un `process.exit` qui saute le teardown n'abandonne pas le conteneur ; un kill laisse un orphelin au ménage suivant.
  process.once("exit", stop);
  return () => {
    process.off("exit", stop);
    stop();
  };
}

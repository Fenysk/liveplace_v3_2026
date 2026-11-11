import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
// Un seul lancement de tests à la fois sur la machine (JOURNAL 2026-11-11) : le suivant attend le verrou du premier.
// Il vit hors du dépôt, donc il est commun à tous les worktrees et à toutes les séances.
export const TEST_RUN_LOCK_PATH = join(tmpdir(), "liveplace-test-run.lock");
const LOCK_POLL_MS = 1_000;
const LOCK_WAIT_LIMIT_MS = 15 * 60_000;
// Un verrou créé puis écrit en quelques microsecondes : vide plus de 10 s, son créateur est mort entre les deux.
const UNFINISHED_LOCK_MS = 10_000;
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

// Le verrou : un fichier créé d'un coup (`wx`), qui dit qui le tient (pid, heure, dossier du lancement).
export type TestRunHolder = { pid: number; acquiredAt: number; cwd: string };
export type LockAction = "wait" | "take over";
export type LockOptions = {
  path?: string;
  pollMs?: number;
  waitLimitMs?: number;
  pid?: number;
  cwd?: string;
  isAlive?: (pid: number) => boolean;
  say?: (message: string) => void;
};

export const stringifyHolder = (holder: TestRunHolder): string => JSON.stringify(holder);

// null : un contenu qui n'est pas le nôtre, ou pas encore écrit en entier.
export const parseHolder = (text: string): TestRunHolder | null => {
  try {
    const { pid, acquiredAt, cwd } = JSON.parse(text) as Partial<TestRunHolder>;
    return typeof pid === "number" &&
      Number.isInteger(pid) &&
      typeof acquiredAt === "number" &&
      typeof cwd === "string"
      ? { pid, acquiredAt, cwd }
      : null;
  } catch {
    return null;
  }
};

// Même règle que pour un orphelin : celui qui tient le verrou est mort, ou le verrou a plus de 30 min (un pid réutilisé).
// Un verrou sans contenu lisible est un verrou en train d'être écrit : on lui laisse 10 s, d'après l'heure du fichier.
export const decideLockAction = (
  text: string,
  modifiedAt: number,
  now: number,
  isAlive: (pid: number) => boolean,
): LockAction => {
  const holder = parseHolder(text);
  if (holder === null) return now - modifiedAt > UNFINISHED_LOCK_MS ? "take over" : "wait";
  return !isAlive(holder.pid) || now - holder.acquiredAt > MAX_AGE_MS ? "take over" : "wait";
};

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;

// Windows répond EPERM ou EBUSY devant un fichier en cours de suppression : il va disparaître, on attend.
// Toute autre erreur (dossier absent, accès refusé) remonte : attendre n'y changerait rien.
const hasCode = (error: unknown, codes: readonly string[]): boolean => codes.includes(errorCode(error) ?? "");

type LockFile = { text: string; modifiedAt: number };

const getLockFile = (path: string): LockFile | null => {
  try {
    return { text: readFileSync(path, "utf8"), modifiedAt: statSync(path).mtimeMs };
  } catch (error) {
    if (hasCode(error, ["ENOENT", "EPERM", "EBUSY"])) return null;
    throw error;
  }
};

const createLock = (path: string, holder: TestRunHolder): boolean => {
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx");
  } catch (error) {
    if (hasCode(error, ["EEXIST", "EPERM", "EBUSY"])) return false;
    throw error;
  }
  try {
    writeSync(descriptor, stringifyHolder(holder));
  } finally {
    closeSync(descriptor);
  }
  return true;
};

const unlinkLock = (path: string): boolean => {
  try {
    unlinkSync(path);
    return true;
  } catch (error) {
    return errorCode(error) === "ENOENT";
  }
};

// Reprise d'un verrou abandonné : on relit juste avant de supprimer, et on ne supprime que si le contenu n'a pas changé.
// Course qui reste : entre cette relecture et `unlinkSync`, un autre repreneur peut avoir supprimé le même verrou mort et posé le sien ;
// on supprimerait alors un verrou vivant et deux lancements tourneraient ensemble. Il faut deux lancements qui reprennent le même
// verrou mort à quelques microsecondes d'écart : le prix d'un verrou sans service de verrouillage du système, jugé acceptable ici.
const takeOver = (path: string, observed: string): boolean =>
  getLockFile(path)?.text === observed && unlinkLock(path);

// Ne rend que son propre verrou : si le fichier porte un autre pid, un autre lancement l'a repris, et il n'est plus à nous.
const releaseLock = (path: string, pid: number): void => {
  const file = getLockFile(path);
  if (file !== null && parseHolder(file.text)?.pid === pid) unlinkLock(path);
};

// Reprend le verrou s'il est abandonné ; false si son titulaire vit, ou si le verrou a changé entre-temps.
const reclaimAbandoned = (path: string, isAlive: (pid: number) => boolean): boolean => {
  const file = getLockFile(path);
  return (
    file !== null &&
    decideLockAction(file.text, file.modifiedAt, Date.now(), isAlive) === "take over" &&
    takeOver(path, file.text)
  );
};

const describeHolder = (file: LockFile | null): string => {
  const holder = file === null ? null : parseHolder(file.text);
  return holder === null ? "pid inconnu" : `pid ${holder.pid}, dossier ${holder.cwd}`;
};

const waitMessage = (holder: string): string =>
  `Tests en attente : un autre lancement (${holder}) les fait tourner ; ils démarrent dès qu'il a fini.\n`;

const waitLimitMessage = (waitLimitMs: number, holder: string, path: string): string =>
  `Les tests attendent depuis plus de ${Math.round(waitLimitMs / 60_000)} min un autre lancement (${holder}) qui ne finit pas. S'il est bloqué, l'arrêter, ou supprimer ${path} s'il est mort, puis relancer les tests.`;

const once = (fn: (message: string) => void): ((message: string) => void) => {
  let isDone = false;
  return (message) => {
    if (!isDone) fn(message);
    isDone = true;
  };
};

const LOCK_DEFAULTS: Required<LockOptions> = {
  path: TEST_RUN_LOCK_PATH,
  pollMs: LOCK_POLL_MS,
  waitLimitMs: LOCK_WAIT_LIMIT_MS,
  pid: process.pid,
  cwd: process.cwd(),
  isAlive: isProcessAlive,
  say: (message) => {
    process.stderr.write(message);
  },
};

// Prend le verrou, ou attend qu'il soit rendu ; renvoie de quoi le rendre. Une seule phrase sur stderr, au premier tour d'attente.
export async function acquireTestRunLock(options: LockOptions = {}): Promise<() => void> {
  const { path, pollMs, waitLimitMs, pid, cwd, isAlive, say } = { ...LOCK_DEFAULTS, ...options };
  const startedWaiting = Date.now();
  const sayOnce = once(say);
  for (;;) {
    if (createLock(path, { pid, acquiredAt: Date.now(), cwd })) return () => releaseLock(path, pid);
    if (reclaimAbandoned(path, isAlive)) continue;
    const file = getLockFile(path);
    const holder = describeHolder(file);
    if (Date.now() - startedWaiting >= waitLimitMs)
      throw new Error(waitLimitMessage(waitLimitMs, holder, path));
    if (file !== null) sayOnce(waitMessage(holder));
    await delay(pollMs);
  }
}

// Le Redis de ce lancement : démarré, prêt, son port donné aux tests ; renvoie de quoi l'arrêter.
async function startTestRedis(project: Pick<TestProject, "provide">): Promise<() => void> {
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

// Le verrou d'abord, avant le ménage et le conteneur : un lancement qui attend ne touche à rien.
// Un `process.exit` qui saute le teardown rend aussi le verrou ; un kill le laisse, et le suivant le reprend (pid mort).
// Le second paramètre ne sert qu'aux tests de ce fichier : Vitest n'appelle `setup` qu'avec le projet.
export default async function setup(
  project: Pick<TestProject, "provide">,
  lock: LockOptions = {},
): Promise<() => void> {
  const release = await acquireTestRunLock(lock);
  process.once("exit", release);
  const giveBack = () => {
    process.off("exit", release);
    release();
  };
  try {
    const stopRedis = await startTestRedis(project);
    return () => {
      stopRedis();
      giveBack();
    };
  } catch (error) {
    giveBack();
    throw error;
  }
}

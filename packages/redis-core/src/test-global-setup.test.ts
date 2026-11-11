import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import setup, {
  acquireTestRunLock,
  DOCKER_DOWN_MESSAGE,
  decideLockAction,
  listOrphans,
  parseContainers,
  parseHolder,
  stringifyHolder,
  sweepOrphans,
  TEST_REDIS_IMAGE,
  TEST_REDIS_LABEL,
  TEST_RUN_LOCK_PATH,
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

// Le verrou du lancement qui exécute ces tests est tenu par le processus principal : `setup` en prend un à lui, dans un dossier temporaire.
let lockDir = "";
const lockPath = () => join(lockDir, "test-run.lock");
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid ?? 0;
const holderOf = (pid: number, ageMs: number, cwd = "C:\\work\\other-session") => ({
  pid,
  acquiredAt: now - ageMs,
  cwd,
});

beforeEach(() => {
  lockDir = mkdtempSync(join(tmpdir(), "liveplace-lock-test-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(lockDir, { recursive: true, force: true });
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

    await expect(setup({ provide }, { path: lockPath() })).rejects.toThrow(DOCKER_DOWN_MESSAGE);
    expect(provide).not.toHaveBeenCalled();
    expect(existsSync(lockPath())).toBe(false);
  });

  // Docker absent : même message
  it("stops with the same message when the docker command does not exist", async () => {
    vi.stubEnv("PATH", "");
    const provide = vi.fn();

    await expect(setup({ provide }, { path: lockPath() })).rejects.toThrow(DOCKER_DOWN_MESSAGE);
    expect(provide).not.toHaveBeenCalled();
    expect(existsSync(lockPath())).toBe(false);
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

describe("a test run waits while another one runs on the same machine (JOURNAL 2026-11-11)", () => {
  const fast = { pollMs: 10, waitLimitMs: 5_000 };

  // Un lancement vivant garde le verrou ; un mort, ou un verrou de plus de 30 min (pid réutilisé), le perd
  it("waits for a holder that is alive and recent", () => {
    const text = stringifyHolder(holderOf(100, 5 * MINUTE));

    expect(decideLockAction(text, now, now, () => true)).toBe("wait");
  });

  it("takes the lock over from a dead holder, however young", () => {
    const text = stringifyHolder(holderOf(100, MINUTE));

    expect(decideLockAction(text, now, now, () => false)).toBe("take over");
  });

  it("takes the lock over after 30 minutes even when the holder pid answers", () => {
    expect(decideLockAction(stringifyHolder(holderOf(100, 31 * MINUTE)), now, now, () => true)).toBe(
      "take over",
    );
    expect(decideLockAction(stringifyHolder(holderOf(100, 29 * MINUTE)), now, now, () => true)).toBe("wait");
  });

  // Un fichier créé mais pas encore écrit : on lui laisse 10 s avant de le dire abandonné
  it("waits for a lock that is still being written and takes over one left unreadable for more than 10 seconds", () => {
    expect(decideLockAction("", now - 2_000, now, () => false)).toBe("wait");
    expect(decideLockAction("", now - 11_000, now, () => true)).toBe("take over");
    expect(decideLockAction("{not json", now - 11_000, now, () => true)).toBe("take over");
  });

  it("writes who holds the lock and reads it back, and rejects what is not a holder", () => {
    const holder = holderOf(4242, 0);

    expect(parseHolder(stringifyHolder(holder))).toEqual(holder);
    expect(parseHolder("")).toBeNull();
    expect(parseHolder("null")).toBeNull();
    expect(parseHolder('{"pid":"7","acquiredAt":1,"cwd":"x"}')).toBeNull();
  });

  it("keeps its default lock file outside the repository, in the machine temporary folder", () => {
    expect(TEST_RUN_LOCK_PATH).toBe(join(tmpdir(), "liveplace-test-run.lock"));
  });

  it("takes the lock, names itself in it, and gives it back", async () => {
    const say = vi.fn();

    const release = await acquireTestRunLock({
      ...fast,
      path: lockPath(),
      pid: 4242,
      cwd: "C:\\work\\mine",
      say,
    });

    expect(parseHolder(readFileSync(lockPath(), "utf8"))).toMatchObject({ pid: 4242, cwd: "C:\\work\\mine" });
    expect(say).not.toHaveBeenCalled();
    release();
    expect(existsSync(lockPath())).toBe(false);
    release(); // rendre deux fois ne casse rien
  });

  // Un lancement qui a perdu son verrou (repris après 30 min) ne supprime pas celui du nouveau titulaire
  it("does not remove a lock that another launch now holds", async () => {
    const release = await acquireTestRunLock({ ...fast, path: lockPath(), pid: 4242 });
    writeFileSync(lockPath(), stringifyHolder(holderOf(5555, 0)));

    release();

    expect(parseHolder(readFileSync(lockPath(), "utf8"))?.pid).toBe(5555);
  });

  it("makes a second launch wait, once and in French, until the first gives the lock back, then takes it", async () => {
    const first = await acquireTestRunLock({
      ...fast,
      path: lockPath(),
      pid: process.pid,
      cwd: "C:\\work\\first",
    });
    const say = vi.fn();
    let hasTaken = false;

    const second = acquireTestRunLock({ ...fast, path: lockPath(), pid: process.pid + 1, say }).then(
      (release) => {
        hasTaken = true;
        return release;
      },
    );
    await delay(150);

    expect(hasTaken).toBe(false);
    expect(say).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith(
      `Tests en attente : un autre lancement (pid ${process.pid}, dossier C:\\work\\first) les fait tourner ; ils démarrent dès qu'il a fini.\n`,
    );

    first();
    const releaseSecond = await second;

    expect(parseHolder(readFileSync(lockPath(), "utf8"))?.pid).toBe(process.pid + 1);
    expect(say).toHaveBeenCalledTimes(1);
    releaseSecond();
    expect(existsSync(lockPath())).toBe(false);
  });

  // Un lancement tué n'a pas pu rendre son verrou : le suivant le reprend sans attendre, sans rien dire
  it("takes over a lock abandoned by a launch whose process is dead", async () => {
    writeFileSync(lockPath(), stringifyHolder(holderOf(deadPid(), MINUTE)));
    const say = vi.fn();

    const release = await acquireTestRunLock({ ...fast, path: lockPath(), pid: 4242, say });

    expect(parseHolder(readFileSync(lockPath(), "utf8"))?.pid).toBe(4242);
    expect(say).not.toHaveBeenCalled();
    release();
    expect(existsSync(lockPath())).toBe(false);
  });

  it("fails with a message naming the holder pid and folder when the wait goes past the limit", async () => {
    writeFileSync(
      lockPath(),
      stringifyHolder({ pid: process.pid, acquiredAt: Date.now(), cwd: "C:\\work\\stuck" }),
    );

    await expect(
      acquireTestRunLock({ path: lockPath(), pollMs: 10, waitLimitMs: 80, pid: 4242, say: vi.fn() }),
    ).rejects.toThrow(`pid ${process.pid}, dossier C:\\work\\stuck`);
    expect(parseHolder(readFileSync(lockPath(), "utf8"))?.pid).toBe(process.pid);
  });
});

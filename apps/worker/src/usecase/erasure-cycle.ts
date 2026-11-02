// CDC §8, Supprimer son compte : le cycle qui réécrit les fichiers de sauvegarde d'un compte supprimé (JOURNAL 2026-11-02). La
// demande est dans Convex (`erasures`), inscrite par la routine après la purge de Redis. Une passe lit les lignes une fois pour
// tous les comptes demandés, ne télécharge que les fichiers qui peuvent les nommer, et ne solde les demandes qu'une fois tout lu.
//
// La course avec les autres cycles est fermée par l'ordre : tous tournent dans la boucle d'un seul worker, jamais ensemble. Une
// sauvegarde qui a lu Redis avant la purge se termine avant l'ouverture d'une passe (elle est dans les lignes qu'on lit), et
// toute lecture de Redis d'après est postérieure à la purge.

import {
  deleteAccountFromChunk,
  deleteAccountFromSnapshot,
  listChunkAccounts,
  listSnapshotAccounts,
} from "@liveplace/domain/account-erasure";
import { createAccountsFilter, mayNameAccount } from "@liveplace/domain/accounts-filter";
import type { Chunk } from "@liveplace/domain/chunk";
import type { ErasureStore, StoredFile, StoredFileKind } from "@liveplace/domain/ports";
import type { CanvasSnapshot } from "@liveplace/domain/snapshot";
import type { Result } from "@liveplace/shared";

const CHECK_MS = 5 * 60_000; // les demandes ne sont pas relues plus souvent : une lecture Convex par passage, 1 M d'appels par mois
const RETRY_MS = 5 * 60_000; // une passe interrompue (Convex a coupé, un envoi refusé) repart de zéro : les fichiers propres coûtent une ligne
const FILES_PER_PAGE = 50; // des lignes lues par appel
const TICK_BUDGET_MS = 5_000; // un tour rend la main au bail et aux autres cycles

// Un fichier d'un genre : son codec, les comptes qu'il nomme, et la règle qui les en retire.
type FileRules<Content> = {
  decode(bytes: Uint8Array): Promise<Result<Content, string>>;
  encode(content: Content): Promise<Uint8Array>;
  list(content: Content): Set<string>;
  remove(content: Content, userId: string): Content;
};

export type ErasureCycleDeps = {
  store: ErasureStore;
  decodeSnapshot(bytes: Uint8Array): Promise<Result<CanvasSnapshot, string>>;
  encodeSnapshot(snapshot: CanvasSnapshot): Promise<Uint8Array>;
  decodeChunk(bytes: Uint8Array): Promise<Result<Chunk, string>>;
  encodeChunk(chunk: Chunk): Promise<Uint8Array>;
  now(): number;
  log(message: string, error?: unknown): void;
};

// `rewritten` : un nouveau fichier a pris la place ; `clean` : rien à y faire ; `discarded` : illisible, parti ;
// `unsupported` : un format que ce worker ne sait pas écrire, la demande reste.
type Outcome = "rewritten" | "clean" | "discarded" | "unsupported";

// Une passe : les comptes demandés à son ouverture, le genre de fichier en cours, et la page lue qui reste à traiter.
type Pass = {
  userIds: string[];
  kinds: StoredFileKind[];
  cursor: string | null;
  queue: StoredFile[];
  isLastPage: boolean;
  counts: Record<Outcome, number>;
};

export function createErasureCycle({
  store,
  decodeSnapshot,
  encodeSnapshot,
  decodeChunk,
  encodeChunk,
  now,
  log,
}: ErasureCycleDeps) {
  const snapshotRules: FileRules<CanvasSnapshot> = {
    decode: decodeSnapshot,
    encode: encodeSnapshot,
    list: listSnapshotAccounts,
    remove: deleteAccountFromSnapshot,
  };
  const chunkRules: FileRules<Chunk> = {
    decode: decodeChunk,
    encode: encodeChunk,
    list: listChunkAccounts,
    remove: deleteAccountFromChunk,
  };
  let pass: Pass | null = null;
  let nextCheckAt = 0;

  const mayName = ({ accountsFilter }: StoredFile, userIds: readonly string[]): boolean =>
    accountsFilter === undefined || userIds.some((userId) => mayNameAccount(accountsFilter, userId));

  // Le fichier lu : s'il nomme un compte demandé il est réécrit ; sinon, et sans filtre (d'avant), il reçoit le sien pour que la
  // passe suivante ne le lise plus.
  const settle = async <Content>(
    rules: FileRules<Content>,
    kind: StoredFileKind,
    file: StoredFile,
    content: Content,
    userIds: readonly string[],
  ): Promise<Outcome> => {
    const named = rules.list(content);
    const hits = userIds.filter((userId) => named.has(userId));
    if (hits.length === 0) {
      if (file.accountsFilter === undefined)
        await store.stampFilter(kind, file.storageId, createAccountsFilter(named));
      return "clean";
    }
    const erased = hits.reduce(rules.remove, content);
    await store.replaceFile(
      kind,
      file.storageId,
      await rules.encode(erased),
      createAccountsFilter(rules.list(erased)),
    );
    return "rewritten";
  };

  // Illisible : personne ne le restaure, et rien ne prouve qu'il ne nomme pas le compte. Il part avec ses lignes.
  const discard = async (kind: StoredFileKind, storageId: string): Promise<Outcome> => {
    await store.discardFile(kind, storageId);
    return "discarded";
  };

  // Le filtre dit « non » : rien à lire. Sinon le fichier est décodé et on cherche les comptes pour de bon.
  const rewrite = async <Content>(
    rules: FileRules<Content>,
    kind: StoredFileKind,
    file: StoredFile,
    userIds: readonly string[],
  ): Promise<Outcome> => {
    if (!mayName(file, userIds)) return "clean";
    const bytes = await store.getFile(kind, file.storageId);
    if (!bytes) return "clean"; // parti entre la liste et la lecture
    const decoded = await rules.decode(bytes);
    if (decoded.ok) return settle(rules, kind, file, decoded.value, userIds);
    return decoded.error === "unsupported_version" ? "unsupported" : discard(kind, file.storageId);
  };

  const treat = (kind: StoredFileKind, file: StoredFile, userIds: readonly string[]): Promise<Outcome> =>
    kind === "snapshot"
      ? rewrite(snapshotRules, kind, file, userIds)
      : rewrite(chunkRules, kind, file, userIds);

  // Tout est lu : les demandes se soldent, sauf si un fichier n'a pas pu être traité (un format que ce worker ne lit pas).
  const finish = async ({ userIds, counts }: Pass): Promise<void> => {
    pass = null;
    if (counts.unsupported > 0) {
      nextCheckAt = now() + RETRY_MS;
      return log(
        `réécriture des sauvegardes : ${counts.unsupported} fichier(s) d'un format inconnu, demandes gardées`,
      );
    }
    for (const userId of userIds) await store.completeErasure(userId);
    nextCheckAt = now() + CHECK_MS;
    log(
      `réécriture des sauvegardes finie : ${counts.rewritten} réécrit(s), ${counts.discarded} illisible(s) retiré(s), ${userIds.length} compte(s)`,
    );
  };

  const open = async (): Promise<Pass | null> => {
    const userIds = await store.listPendingErasures();
    if (userIds.length === 0) return null;
    return {
      userIds,
      kinds: ["snapshot", "chunk"],
      cursor: null,
      queue: [],
      isLastPage: false,
      counts: { rewritten: 0, clean: 0, discarded: 0, unsupported: 0 },
    };
  };

  // Un tour de la passe : les fichiers de la page en cours, puis la page suivante, puis le genre suivant, tant que le budget le permet.
  const advance = async (current: Pass, startedAt: number): Promise<void> => {
    while (now() - startedAt < TICK_BUDGET_MS) {
      const kind = current.kinds[0];
      if (kind === undefined) return finish(current);
      const file = current.queue.shift();
      if (file) {
        current.counts[await treat(kind, file, current.userIds)] += 1;
        continue;
      }
      if (current.isLastPage) {
        current.kinds.shift();
        current.cursor = null;
        current.isLastPage = false;
        continue;
      }
      const page = await store.listFiles(kind, current.cursor, FILES_PER_PAGE);
      current.queue = page.files;
      current.cursor = page.next;
      current.isLastPage = page.next === null;
    }
  };

  return {
    async tick(): Promise<void> {
      const startedAt = now();
      try {
        if (!pass) {
          if (startedAt < nextCheckAt) return;
          pass = await open();
          if (!pass) {
            nextCheckAt = startedAt + CHECK_MS;
            return;
          }
        }
        await advance(pass, startedAt);
      } catch (error) {
        pass = null;
        nextCheckAt = now() + RETRY_MS;
        log("réécriture des sauvegardes interrompue, elle reprend dans 5 min", error);
      }
    },
  };
}

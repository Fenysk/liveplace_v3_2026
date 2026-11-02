// CDC §8, Supprimer son compte : `deleteAccount`, la seule routine qui efface un compte et tout ce qui le nomme, aussitôt
// et sans retour (JOURNAL 2026-11-01). Le bouton de Mon compte, l'accès retiré chez Twitch, une demande par le contact
// et, plus tard, deux ans sans connexion l'appellent tous. Elle ne journalise jamais l'identifiant.
//
// L'ordre fait la reprise fiable : Convex oublie les fresques avant que Redis les vide (le worker ne les remettrait pas en
// place) ; les traces partent avant le miroir `user:` (sans lui, l'inspection afficherait l'identifiant brut) ; la demande de
// réécriture des sauvegardes vient après les traces et avant la preuve ; la preuve s'écrit avec la ligne du compte ; les
// abonnements de Twitch partent en dernier, pour qu'une panne de Twitch ne retarde aucun effacement chez nous ;
// l'identifiant ne quitte `deletions:pending` qu'à la fin. Chaque étape est idempotente.

import { type AccountDeletionTrigger, DELETED_ACCOUNT_TTL_SECONDS, type Timestamp } from "@liveplace/domain";
import type {
  AccountPurge,
  DeletedProfile,
  DurableStore,
  PendingDeletion,
  TwitchEventSub,
} from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";

// Le web relance chaque minute ce qui est resté en cours (un arrêt, une panne de Convex ou de Redis).
export const RESUME_PENDING_DELETIONS_MS = 60_000;

export type DeleteAccountDeps = {
  durable: Pick<
    DurableStore,
    | "listCanvasesForOwner"
    | "discardOwnedCanvases"
    | "requestErasure"
    | "keepDeletedAccount"
    | "syncDeletedAccounts"
    | "deleteUser"
    | "detachDiscoveredAccounts"
  >;
  purge: AccountPurge;
  // Les abonnements de live et de modération que Twitch garde au nom du compte (CDC §8, JOURNAL 2026-11-02).
  eventSub: Pick<TwitchEventSub, "deleteSubscriptions">;
  // Ce que le web gardait en mémoire de lui : sa carte d'aperçu, son image de fond, sa photo.
  forgetOwner: (profile: DeletedProfile) => void;
  now: () => Timestamp;
  randomRunId: () => string;
};

export type DeleteAccountRequest = { userId: string; trigger: AccountDeletionTrigger };

const listOwnedCanvasIds = async (durable: DeleteAccountDeps["durable"], ownerId: string) => {
  const { active, archives } = await durable.listCanvasesForOwner(ownerId);
  return [...(active ? [active.canvasId] : []), ...archives.map(({ canvasId }) => canvasId)];
};

// L'effacement en cours garde ses fresques et son heure : une reprise ne les change pas, et rejoue l'annonce du compte. Deux
// demandes en même temps (un double clic) tirent chacune leur `runId` : celui que Redis a gardé fait foi, la preuve n'est écrite
// qu'une fois.
const markPending = async (
  deps: DeleteAccountDeps,
  { userId, trigger }: DeleteAccountRequest,
): Promise<PendingDeletion> => {
  const pending = (await deps.purge.getPending(userId)) ?? {
    userId,
    runId: deps.randomRunId(),
    trigger,
    startedAt: deps.now(),
    canvasIds: await listOwnedCanvasIds(deps.durable, userId),
  };
  await deps.purge.begin(pending);
  return (await deps.purge.getPending(userId)) ?? pending;
};

const runDeletion = async (deps: DeleteAccountDeps, pending: PendingDeletion): Promise<void> => {
  const { userId, runId, trigger, startedAt } = pending;
  // L'empreinte de sa session, gardée dans Convex : un Redis perdu ne rend pas la session d'un compte supprimé (JOURNAL 2026-11-02).
  await deps.durable.keepDeletedAccount({
    fingerprint: deps.purge.getFingerprint(userId),
    deletedAt: startedAt,
  });
  const discarded = await deps.durable.discardOwnedCanvases(userId);
  const canvasIds = [...new Set([...pending.canvasIds, ...discarded])];
  await deps.purge.purgeOwnedCanvases(userId, canvasIds);
  await deps.purge.purgeTraces(userId);
  // Redis ne nomme plus le compte : le worker réécrit les fichiers de sauvegarde qui le nomment encore. La demande est dans
  // Convex, donc un Redis perdu ne l'emporte pas (JOURNAL 2026-11-02).
  await deps.durable.requestErasure(userId);
  const profile = await deps.durable.deleteUser(userId, {
    runId,
    deletedAt: startedAt,
    trigger,
    ownedCanvases: canvasIds.length,
  });
  await deps.durable.detachDiscoveredAccounts(userId);
  await deps.purge.purgeAccountKeys(userId);
  if (profile) deps.forgetOwner(profile);
  await deps.eventSub.deleteSubscriptions(userId);
  await deps.purge.finish(userId);
};

// Jamais deux exécutions à la fois pour un même compte (JOURNAL 2026-11-02) : le flux `events` d'une fresque se réécrit dans une
// clé de travail, et une seconde exécution la viderait sous la première, qui échangerait alors une copie incomplète contre le flux.
// La seconde demande, un double clic ou la reprise de la minute, rejoint l'exécution en cours. Un seul web tourne par Redis.
const running = new WeakMap<DeleteAccountDeps, Map<string, Promise<void>>>();

const runOnce = (deps: DeleteAccountDeps, pending: PendingDeletion): Promise<void> => {
  const byAccount = running.get(deps) ?? new Map<string, Promise<void>>();
  running.set(deps, byAccount);
  const joined = byAccount.get(pending.userId);
  if (joined) return joined;
  const run = runDeletion(deps, pending).finally(() => byAccount.delete(pending.userId));
  byAccount.set(pending.userId, run);
  return run;
};

// La réécriture de l'AOF, une fois que rien ne nomme plus le compte. Une réécriture déjà en cours la refuse : le marqueur reste, la
// reprise de la minute suivante la refait.
const rewriteAfterDeletion = async (deps: DeleteAccountDeps): Promise<void> => {
  try {
    await deps.purge.rewriteAppendOnlyFile();
  } catch (error) {
    console.error("delete-account : AOF non réécrit", error);
  }
};

// Les empreintes de session que Redis a perdues, remises depuis Convex (JOURNAL 2026-11-02). Une sentinelle dit qu'elles y sont : sans
// perte, ce passage ne coûte qu'une lecture de Redis. Un échec ne bloque pas la reprise des effacements.
const restoreDeletedMarks = async (deps: DeleteAccountDeps): Promise<void> => {
  try {
    if (await deps.purge.areMarksRestored()) return;
    const nowMs = deps.now();
    const marks = await deps.durable.syncDeletedAccounts(nowMs - DELETED_ACCOUNT_TTL_SECONDS * 1000);
    await deps.purge.restoreMarks(marks, nowMs);
  } catch (error) {
    console.error("delete-account : empreintes de session non remises", error);
  }
};

// Un passage de la reprise : les empreintes de session, chaque effacement resté en cours, puis la réécriture de l'AOF restée à
// faire. Ne rejette jamais ; un échec se journalise sans identifiant, et le passage suivant recommence.
export async function resumePendingDeletions(deps: DeleteAccountDeps): Promise<void> {
  await restoreDeletedMarks(deps);
  try {
    for (const pending of await deps.purge.listPending()) {
      try {
        await runOnce(deps, pending);
      } catch (error) {
        console.error("delete-account : effacement repris sans aboutir", error);
      }
    }
    await deps.purge.rewriteAppendOnlyFile();
  } catch (error) {
    console.error("delete-account : reprise impossible", error);
  }
}

// Ce que la routine fait après l'inscription : la fin de l'effacement, que personne n'est obligé d'attendre. Ne rejette jamais.
const finishDeletion = async (
  deps: DeleteAccountDeps,
  pending: PendingDeletion,
): Promise<Result<void, "failed">> => {
  try {
    await runOnce(deps, pending);
  } catch (error) {
    console.error("delete-account : effacement interrompu, il reprendra seul", error);
    return { ok: false, error: "failed" };
  }
  await rewriteAfterDeletion(deps);
  return { ok: true, value: undefined };
};

// `done` : la fin de l'effacement. Dès que le compte est inscrit dans `deletions:pending`, l'effacement est acquis : la reprise
// le termine même si cette exécution échoue ou si le web s'arrête.
export type BeganDeletion = { done: Promise<Result<void, "failed">> };

// Inscrit l'effacement, puis lance la routine sans l'attendre. `failed` : rien n'est inscrit, le compte reste entier.
export async function beginAccountDeletion(
  deps: DeleteAccountDeps,
  request: DeleteAccountRequest,
): Promise<Result<BeganDeletion, "failed">> {
  let pending: PendingDeletion;
  try {
    pending = await markPending(deps, request);
  } catch (error) {
    console.error("delete-account : effacement non inscrit, le compte reste", error);
    return { ok: false, error: "failed" };
  }
  return { ok: true, value: { done: finishDeletion(deps, pending) } };
}

// Le compte et tout ce qui le nomme partent. Un échec dit `failed` et laisse l'effacement en cours : il reprend seul, à la
// minute suivante, ou à la reconnexion du compte.
export async function deleteAccount(
  deps: DeleteAccountDeps,
  request: DeleteAccountRequest,
): Promise<Result<void, "failed">> {
  const began = await beginAccountDeletion(deps, request);
  return began.ok ? began.value.done : began;
}

// Une reconnexion pendant un effacement interrompu le termine d'abord : sinon il effacerait le compte neuf.
export async function finishPendingDeletion(deps: DeleteAccountDeps, userId: string): Promise<void> {
  const pending = await deps.purge.getPending(userId);
  if (pending) await runOnce(deps, pending);
}

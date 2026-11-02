// CDC §8, Supprimer son compte : ce que les sauvegardes (snapshots complets, chunks) gardent d'un compte supprimé (JOURNAL
// 2026-11-02). La règle de chaque donnée est celle de la purge de Redis (`redis-core/src/account-purge.ts`) : `deleted` là
// où Redis garde `deleted`, retiré là où Redis retire. `account-erasure-parity.test.ts` fait tourner les deux sur un même
// monde et exige le même résultat : ajouter un champ nommant un compte à `CanvasSnapshot` demande de l'ajouter ici ET à
// Redis, et le test le dit.

import type { Chunk } from "./chunk";
import { DELETED_AUTHOR } from "./index";
import type { CanvasSnapshot } from "./snapshot";

// `<auteur>:<pose>` (§5.1) : l'auteur est tout ce qui précède le premier `:`, `placementId` n'en a jamais.
const authorOf = (placementKey: string): string =>
  placementKey.slice(0, Math.max(0, placementKey.indexOf(":")));

const without = <Value>(record: Record<string, Value>, userId: string): Record<string, Value> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== userId));

// `ZRANGE` rend les membres par score puis par ordre d'octets : le snapshot garde cet ordre.
const byScoreThenMember = (
  [firstKey, firstAt]: [string, number],
  [secondKey, secondAt]: [string, number],
): number => firstAt - secondAt || (firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : 0);

// Le dictionnaire des auteurs, `userId` devenu `deleted` : un rang par valeur, dans l'ordre de première apparition.
const renameAuthor = (snapshot: CanvasSnapshot, userId: string) => {
  const authors: string[] = [];
  const ranks = snapshot.authors.map((author) => {
    const renamed = author === userId ? DELETED_AUTHOR : author;
    const known = authors.indexOf(renamed);
    if (known !== -1) return known;
    authors.push(renamed);
    return authors.length - 1;
  });
  return {
    authors,
    cells: snapshot.cells.map(([cellKey, authorIndex, ...rest]): CanvasSnapshot["cells"][number] => [
      cellKey,
      ranks[authorIndex] ?? authorIndex,
      ...rest,
    ]),
  };
};

// Une pose du compte devient celle de `deleted`, sauf si une pierre tombale la couvre : elle part (`null`).
const placementMover = (snapshot: CanvasSnapshot, userId: string) => {
  const ownPrefix = `${userId}:`;
  const cleared = new Set(snapshot.clearedPlacements.filter((member) => member.startsWith(ownPrefix)));
  return (placementKey: string): string | null => {
    if (!placementKey.startsWith(ownPrefix)) return placementKey;
    return cleared.has(placementKey) ? null : `${DELETED_AUTHOR}:${placementKey.slice(ownPrefix.length)}`;
  };
};

const moveAll = (members: readonly string[], move: (member: string) => string | null): string[] => [
  ...new Set(members.flatMap((member) => move(member) ?? [])),
];

// Le zset `reported` : une pose renommée garde le score d'une pose `deleted` déjà signalée (ZADD NX).
const moveReported = (
  reported: CanvasSnapshot["reported"],
  move: (member: string) => string | null,
): CanvasSnapshot["reported"] => {
  const present = new Set(reported.map(([member]) => member));
  const kept: [string, number][] = reported.filter(([member]) => move(member) === member);
  for (const [member, reportedAt] of reported) {
    const moved = move(member);
    if (moved !== null && moved !== member && !present.has(moved)) kept.push([moved, reportedAt]);
  }
  return kept.sort(byScoreThenMember);
};

// Les signaleurs de chaque pose, le compte retiré de chacun et la pose renommée qui reçoit ceux de la sienne. Rend aussi les poses
// qu'il avait signalées, sous leur nom d'après.
const moveReporters = (snapshot: CanvasSnapshot, userId: string, move: (member: string) => string | null) => {
  const reports: Record<string, string[]> = {};
  const reportedBy = new Set<string>();
  for (const [placement, reporters] of Object.entries(snapshot.reports)) {
    const moved = move(placement);
    if (moved === null) continue;
    const rest = reporters.filter((reporter) => reporter !== userId);
    reports[moved] = [...new Set([...(reports[moved] ?? []), ...rest])];
    if (rest.length < reporters.length) reportedBy.add(moved);
  }
  return { reports, reportedBy };
};

// Une pose qu'il était seul à signaler : cachée du stream elle garde un signaleur anonyme, sinon elle n'est plus signalée
// (JOURNAL 2026-11-01). Rend les signalements et les poses qui n'en ont plus.
const settleEmptied = (
  { reports, reportedBy }: ReturnType<typeof moveReporters>,
  offStream: readonly string[],
) => {
  const unreported = new Set<string>();
  for (const placement of reportedBy) {
    if ((reports[placement] ?? []).length > 0) continue;
    if (offStream.includes(placement)) {
      reports[placement] = [DELETED_AUTHOR];
    } else {
      delete reports[placement];
      unreported.add(placement);
    }
  }
  return { reports, unreported };
};

// Le snapshot d'un canvas sans le compte : ni clé, ni membre, ni valeur ne le nomme. Une valeur nommée en clé (progression,
// bannis, classement) part ; les poses et les cases passent sous `deleted`.
export function deleteAccountFromSnapshot(snapshot: CanvasSnapshot, userId: string): CanvasSnapshot {
  const move = placementMover(snapshot, userId);
  const offStream = moveAll(snapshot.offStream, move);
  const { reports, unreported } = settleEmptied(moveReporters(snapshot, userId, move), offStream);
  return {
    ...snapshot,
    ...renameAuthor(snapshot, userId),
    meta: snapshot.meta.ownerId === userId ? { ...snapshot.meta, ownerId: DELETED_AUTHOR } : snapshot.meta,
    progress: without(snapshot.progress, userId),
    bans: snapshot.bans.filter((member) => member !== userId),
    bansTwitch: snapshot.bansTwitch.filter((member) => member !== userId),
    banProofs: without(snapshot.banProofs, userId),
    cleared: without(snapshot.cleared, userId),
    clearedPlacements: snapshot.clearedPlacements.filter((member) => !member.startsWith(`${userId}:`)),
    clearedRanges: without(snapshot.clearedRanges, userId),
    mods: snapshot.mods.filter((member) => member !== userId),
    modsTwitch: snapshot.modsTwitch.filter((member) => member !== userId),
    modsLiveplace: snapshot.modsLiveplace.filter((member) => member !== userId),
    twitchUsers: without(snapshot.twitchUsers, userId),
    reported: moveReported(snapshot.reported, move).filter(([member]) => !unreported.has(member)),
    reports,
    offStream,
    approved: moveAll(snapshot.approved, move),
    ...(snapshot.scoreboard ? { scoreboard: without(snapshot.scoreboard, userId) } : {}),
    ...(snapshot.scoreboardBanned ? { scoreboardBanned: without(snapshot.scoreboardBanned, userId) } : {}),
  };
}

// Le flux d'une fresque rangé en chunk : l'auteur d'une pose et le modérateur d'une action, la cible d'une modération.
// Versions, poses, cases et ordre ne bougent pas : le chunk reste celui que son index décrit.
export function deleteAccountFromChunk(chunk: Chunk, userId: string): Chunk {
  return {
    ...chunk,
    entries: chunk.entries.map(([version, placementId, event]) => {
      const { moderation } = event;
      const named = event.authorId === userId || moderation?.target === userId;
      if (!named) return [version, placementId, event];
      return [
        version,
        placementId,
        {
          ...event,
          ...(event.authorId === userId ? { authorId: DELETED_AUTHOR } : {}),
          ...(moderation?.target === userId ? { moderation: { ...moderation, target: DELETED_AUTHOR } } : {}),
        },
      ];
    }),
  };
}

// Les comptes qu'un snapshot nomme, `deleted` exclu : de quoi poser son filtre, et trouver ceux qu'une suppression réécrit.
export function listSnapshotAccounts(snapshot: CanvasSnapshot): Set<string> {
  const named = new Set<string>([
    ...(snapshot.meta.ownerId === undefined ? [] : [snapshot.meta.ownerId]),
    ...snapshot.authors,
    ...Object.keys(snapshot.progress),
    ...snapshot.bans,
    ...snapshot.bansTwitch,
    ...Object.keys(snapshot.banProofs),
    ...Object.keys(snapshot.cleared),
    ...snapshot.clearedPlacements.map(authorOf),
    ...Object.keys(snapshot.clearedRanges),
    ...snapshot.mods,
    ...snapshot.modsTwitch,
    ...snapshot.modsLiveplace,
    ...Object.keys(snapshot.twitchUsers),
    ...snapshot.reported.map(([placementKey]) => authorOf(placementKey)),
    ...Object.entries(snapshot.reports).flatMap(([placementKey, reporters]) => [
      authorOf(placementKey),
      ...reporters,
    ]),
    ...snapshot.offStream.map(authorOf),
    ...snapshot.approved.map(authorOf),
    ...Object.keys(snapshot.scoreboard ?? {}),
    ...Object.keys(snapshot.scoreboardBanned ?? {}),
  ]);
  named.delete(DELETED_AUTHOR);
  return named;
}

export function listChunkAccounts(chunk: Chunk): Set<string> {
  const named = new Set<string>();
  for (const [, , event] of chunk.entries) {
    if (event.authorId !== null) named.add(event.authorId);
    if (event.moderation) named.add(event.moderation.target);
  }
  named.delete(DELETED_AUTHOR);
  return named;
}

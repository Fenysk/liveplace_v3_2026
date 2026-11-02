// Les fichiers de Convex qu'aucune ligne ne désigne (JOURNAL 2026-11-02) : un envoi dont l'enregistrement a échoué, une réécriture
// coupée. Ce qui décide d'en retirer un, pur : la fonction Convex lit les fichiers et leurs références, celle-ci tranche.

export type StoredFileStamp = { id: string; createdAt: number };

export type OrphanPlan = {
  orphanIds: string[];
  // La borne du prochain passage : le dernier fichier assez vieux qu'on a vu. Rien d'avant ne devient orphelin.
  next: number;
  // Plus de fichier assez vieux à voir pour l'instant : un fichier trop jeune, ou une page qui n'est pas pleine.
  isDone: boolean;
};

// `files` : une page de fichiers, du plus ancien au plus récent, à partir de `after` ; `referenced` : ceux qu'une ligne désigne.
// Un fichier de moins de `graceMs` n'est jamais retiré, et arrête la lecture : les suivants sont plus jeunes encore.
export function planOrphanPurge(
  files: readonly StoredFileStamp[],
  referenced: ReadonlySet<string>,
  { nowMs, graceMs, after, pageSize }: { nowMs: number; graceMs: number; after: number; pageSize: number },
): OrphanPlan {
  const orphanIds: string[] = [];
  let next = after;
  for (const { id, createdAt } of files) {
    if (createdAt > nowMs - graceMs) return { orphanIds, next, isDone: true };
    if (!referenced.has(id)) orphanIds.push(id);
    next = createdAt;
  }
  return { orphanIds, next, isDone: files.length < pageSize };
}

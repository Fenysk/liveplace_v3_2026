// Écart §15 (JOURNAL 2026-10-06) : les règles des changements de canvas actif, pures pour se tester sans Convex. Chaque
// mutation lit les canvas du propriétaire, applique un `plan…` et écrit ses écritures dans la même transaction.
// Aucun import : les fonctions Convex sont empaquetées seules, sans les packages du dépôt.

export type StoredCanvas = {
  canvasId: string;
  ownerId: string;
  isActive: boolean;
  width: number;
  height: number;
  createdAt: number;
  archivedAt?: number;
  name?: string;
  linkCode?: string;
};

// Un champ à `undefined` est retiré du document par `db.patch`.
export type CanvasFields = {
  isActive?: boolean;
  archivedAt?: number | undefined;
  name?: string | undefined;
  linkCode?: string;
};

export type IncomingCanvas = {
  canvasId: string;
  ownerId: string;
  isActive: true;
  width: number;
  height: number;
  createdAt: number;
  purgedBeforeVersion: number;
  purgedBeforeTs: number;
};

export type CanvasWrite =
  | { kind: "patch"; canvasId: string; fields: CanvasFields }
  | { kind: "insert"; canvas: IncomingCanvas }
  | { kind: "delete"; canvasId: string };

export type Plan<Refusal extends string> =
  | { ok: true; writes: CanvasWrite[] }
  | { ok: false; error: Refusal };

export type ArchivePlanInput = {
  ownerId: string;
  outgoingId: string;
  incoming: { canvasId: string; width: number; height: number };
  archivedAt: number;
  linkCode: string;
  name?: string | undefined;
  maxArchives: number;
};

export type ReopenPlanInput = {
  ownerId: string;
  outgoingId: string;
  reopenedId: string;
  archivedAt: number;
  linkCode: string;
};

const getActiveCanvas = (canvases: readonly StoredCanvas[], ownerId: string, canvasId: string) =>
  canvases.find((canvas) => canvas.canvasId === canvasId && canvas.ownerId === ownerId && canvas.isActive);

const getArchivedCanvas = (canvases: readonly StoredCanvas[], ownerId: string, canvasId: string) =>
  canvases.find((canvas) => canvas.canvasId === canvasId && canvas.ownerId === ownerId && !canvas.isActive);

// Le sortant devient une archive : son code reste le sien s'il en a un, sinon c'est celui qu'on propose.
const archiveFields = (outgoing: StoredCanvas, input: { archivedAt: number; linkCode: string }) => ({
  isActive: false,
  archivedAt: input.archivedAt,
  linkCode: outgoing.linkCode ?? input.linkCode,
});

// Le plafond se vérifie ici, dans la transaction : deux archivages simultanés ne passent pas tous les deux.
export function planArchive(
  canvases: readonly StoredCanvas[],
  input: ArchivePlanInput,
): Plan<"not_active" | "archives_full"> {
  const outgoing = getActiveCanvas(canvases, input.ownerId, input.outgoingId);
  if (!outgoing) return { ok: false, error: "not_active" };
  if (canvases.filter((canvas) => !canvas.isActive).length >= input.maxArchives)
    return { ok: false, error: "archives_full" };
  return {
    ok: true,
    writes: [
      // Sans nom donné, l'archive n'en a pas : celui du sortant, s'il en avait un, ne reste pas.
      {
        kind: "patch",
        canvasId: outgoing.canvasId,
        fields: { ...archiveFields(outgoing, input), name: input.name },
      },
      {
        kind: "insert",
        canvas: {
          canvasId: input.incoming.canvasId,
          ownerId: input.ownerId,
          isActive: true,
          width: input.incoming.width,
          height: input.incoming.height,
          createdAt: input.archivedAt,
          purgedBeforeVersion: 0,
          purgedBeforeTs: 0,
        },
      },
    ],
  };
}

// Le nombre d'archives ne change pas : l'actif prend la place de l'archive qui revient, avec son code et son nom.
export function planReopen(
  canvases: readonly StoredCanvas[],
  input: ReopenPlanInput,
): Plan<"not_active" | "not_archive"> {
  const outgoing = getActiveCanvas(canvases, input.ownerId, input.outgoingId);
  if (!outgoing) return { ok: false, error: "not_active" };
  if (!getArchivedCanvas(canvases, input.ownerId, input.reopenedId))
    return { ok: false, error: "not_archive" };
  return {
    ok: true,
    writes: [
      { kind: "patch", canvasId: outgoing.canvasId, fields: archiveFields(outgoing, input) },
      { kind: "patch", canvasId: input.reopenedId, fields: { isActive: true, archivedAt: undefined } },
    ],
  };
}

// Jamais le canvas actif, jamais celui d'un autre propriétaire.
export function planDiscard(
  canvases: readonly StoredCanvas[],
  ownerId: string,
  canvasId: string,
): Plan<"not_archive"> {
  if (!getArchivedCanvas(canvases, ownerId, canvasId)) return { ok: false, error: "not_archive" };
  return { ok: true, writes: [{ kind: "delete", canvasId }] };
}

// Le nom du canvas actif seulement, jamais d'une archive ni d'un autre propriétaire. Sans nom, `undefined` retire le champ.
export function planRename(
  canvases: readonly StoredCanvas[],
  ownerId: string,
  canvasId: string,
  name: string | undefined,
): Plan<"not_active"> {
  if (!getActiveCanvas(canvases, ownerId, canvasId)) return { ok: false, error: "not_active" };
  return { ok: true, writes: [{ kind: "patch", canvasId, fields: { name } }] };
}

type ListedActive = {
  canvasId: string;
  width: number;
  height: number;
  createdAt: number;
  name?: string;
  linkCode?: string;
};
type ListedArchive = ListedActive & { archivedAt: number; linkCode: string };

// Sans code ni date d'archivage, un canvas inactif ne serait pas une archive : il n'a pas de lien, on ne le liste pas.
const toArchive = (canvas: StoredCanvas): ListedArchive | null => {
  const { canvasId, width, height, createdAt, archivedAt, linkCode, name } = canvas;
  if (archivedAt === undefined || linkCode === undefined) return null;
  return { canvasId, width, height, createdAt, archivedAt, linkCode, ...(name ? { name } : {}) };
};

export function toOwnerCanvases(canvases: readonly StoredCanvas[]) {
  const active = canvases.find((canvas) => canvas.isActive);
  return {
    active: active
      ? {
          canvasId: active.canvasId,
          width: active.width,
          height: active.height,
          createdAt: active.createdAt,
          ...(active.name ? { name: active.name } : {}),
          ...(active.linkCode ? { linkCode: active.linkCode } : {}),
        }
      : null,
    archives: canvases.filter((canvas) => !canvas.isActive).flatMap((canvas) => toArchive(canvas) ?? []),
  };
}

// Un code désigne une archive, ou le canvas actif qui l'a gardé en revenant.
export function pickLinkedCanvas(canvases: readonly StoredCanvas[], linkCode: string) {
  const linked = canvases.find((canvas) => canvas.linkCode === linkCode);
  if (!linked) return null;
  if (linked.isActive) return { status: "active" as const };
  const archive = toArchive(linked);
  return archive ? { status: "archived" as const, archive } : null;
}

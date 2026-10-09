// Écart §10.3 (JOURNAL 2026-10-06) : ce que la section « Archives » montre.

import type { Timestamp } from "@liveplace/domain";
import type { Archive, ArchiveWrites, DurableStore } from "@liveplace/domain/ports";
import { type Result, toBase64 } from "@liveplace/shared";

export type ListDeps = {
  durable: Pick<DurableStore, "listCanvasesForOwner">;
  redis: Pick<ArchiveWrites, "getCanvasImage">;
};

// Un octet par case (l'index de palette), en base64.
export type Thumbnail = { width: number; height: number; state: string };

export type ListedCanvas = {
  canvasId: string;
  createdAt: Timestamp;
  theme?: string;
  linkCode?: string;
  // Redis fait foi pour la taille : Convex garde celle de la naissance. Sans image, ni taille ni miniature.
  thumbnail: Thumbnail | null;
};

export type ListedArchive = ListedCanvas & { archivedAt: Timestamp; linkCode: string };

export type ListedCanvases = { active: ListedCanvas | null; archives: ListedArchive[] };

// De la plus récente à la plus ancienne.
export const sortArchives = (archives: readonly Archive[]): Archive[] =>
  [...archives].sort((left, right) => right.archivedAt - left.archivedAt);

// Une miniature qui ne se lit pas manque : elle ne vide pas la liste.
const getThumbnail = async (deps: ListDeps, canvasId: string): Promise<Thumbnail | null> => {
  try {
    const image = await deps.redis.getCanvasImage(canvasId);
    return image ? { width: image.width, height: image.height, state: toBase64(image.state) } : null;
  } catch (error) {
    console.error(`canvases : miniature de ${canvasId} non lue`, error);
    return null;
  }
};

export async function listCanvases(
  deps: ListDeps,
  ownerId: string,
): Promise<Result<ListedCanvases, "failed">> {
  try {
    const { active, archives } = await deps.durable.listCanvasesForOwner(ownerId);
    const sorted = sortArchives(archives);
    const [activeThumbnail, ...archiveThumbnails] = await Promise.all([
      active ? getThumbnail(deps, active.canvasId) : null,
      ...sorted.map(({ canvasId }) => getThumbnail(deps, canvasId)),
    ]);
    return {
      ok: true,
      value: {
        active: active && {
          canvasId: active.canvasId,
          createdAt: active.createdAt,
          ...(active.theme ? { theme: active.theme } : {}),
          ...(active.linkCode ? { linkCode: active.linkCode } : {}),
          thumbnail: activeThumbnail ?? null,
        },
        archives: sorted.map(({ canvasId, createdAt, archivedAt, linkCode, theme }, index) => ({
          canvasId,
          createdAt,
          archivedAt,
          linkCode,
          ...(theme ? { theme } : {}),
          thumbnail: archiveThumbnails[index] ?? null,
        })),
      },
    };
  } catch (error) {
    console.error("canvases : liste non lue", error);
    return { ok: false, error: "failed" };
  }
}

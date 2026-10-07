// Écart §10.3 (JOURNAL 2026-10-06) : `/{login}/archives/{code}` → propriétaire par le pseudo, archive par le code. Sans
// session : tous ceux qui ont le lien la voient, connectés ou non, et sans lien on ne la trouve pas.

import { isLinkCode, type Timestamp } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { type CanvasOwner, toCanvasOwner } from "./resolve-canvas";

// De quoi montrer le bandeau : ses dates, et son nom s'il en a un.
export type ResolvedArchive = {
  canvasId: string;
  owner: CanvasOwner;
  createdAt: Timestamp;
  archivedAt: Timestamp;
  name?: string;
};

// `active` : le code est celui d'une archive rouverte, redevenue le canvas actif : la page est `/{login}`.
// `missing` : le propriétaire existe, pas l'archive : la page introuvable dit son nom affiché.
export type ArchivePage =
  | { status: "archived"; archive: ResolvedArchive }
  | { status: "active"; login: string }
  | { status: "missing"; owner: CanvasOwner };

export async function resolveArchive(
  durable: Pick<DurableStore, "getUserByLogin" | "getArchiveByLinkCode">,
  login: string,
  code: string,
): Promise<ArchivePage | null> {
  const owner = await durable.getUserByLogin(login.toLowerCase());
  if (!owner) return null;
  // Un code qui n'a pas la forme d'un code n'a rien à demander à Convex pour l'archive.
  const linked = isLinkCode(code) ? await durable.getArchiveByLinkCode(owner.userId, code) : null;
  if (!linked) return { status: "missing", owner: toCanvasOwner(owner) };
  if (linked.status === "active") return { status: "active", login: owner.login };
  const { canvasId, createdAt, archivedAt, name } = linked.archive;
  return {
    status: "archived",
    archive: { canvasId, owner: toCanvasOwner(owner), createdAt, archivedAt, ...(name ? { name } : {}) },
  };
}

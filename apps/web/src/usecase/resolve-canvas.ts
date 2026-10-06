// `/{login}` : pseudo → propriétaire → canvas actif (§9.1, D-14). Le gateway, lui, ne connaît que le `canvasId`.

import { roleFor, type User } from "@liveplace/domain";
import type { DurableStore, SessionVerifier } from "@liveplace/domain/ports";

// Le profil du streamer pour la pill Canvas (CDC 2026). Sans photo Twitch, la clé est absente.
export type CanvasOwner = Pick<User, "displayName" | "login"> & { avatarUrl?: string };

// Qui regarde : le cookie de la requête et de quoi le vérifier. La vue OBS n'en donne pas : elle ne le lit pas.
export type CanvasVisit = { verifier: SessionVerifier; cookieHeader: string | undefined };

// `isOwnerSession` : pour l'affichage seulement, le gateway décide du rôle (§10.3). Absent sans `CanvasVisit`.
export type ResolvedCanvas = { canvasId: string; owner: CanvasOwner; isOwnerSession?: boolean };

// Le gateway décide du rôle (§10.3) : ici, une erreur de vérification donne un invité, jamais une page cassée.
async function isOwnerSession({ verifier, cookieHeader }: CanvasVisit, ownerId: string): Promise<boolean> {
  try {
    return roleFor(await verifier.verify(cookieHeader), { ownerId }, false) === "owner";
  } catch (error) {
    console.error("resolve-canvas : cookie de session non vérifié, page rendue pour un invité", error);
    return false;
  }
}

export async function resolveCanvas(
  durable: DurableStore,
  login: string,
  visit?: CanvasVisit,
): Promise<ResolvedCanvas | null> {
  const owner = await durable.getUserByLogin(login.toLowerCase());
  if (!owner) return null;
  const canvas = await durable.getActiveCanvasForOwner(owner.userId);
  if (!canvas) return null;
  const { displayName, avatarUrl } = owner;
  return {
    canvasId: canvas.canvasId,
    owner: { displayName, login: owner.login, ...(avatarUrl ? { avatarUrl } : {}) },
    ...(visit ? { isOwnerSession: await isOwnerSession(visit, owner.userId) } : {}),
  };
}

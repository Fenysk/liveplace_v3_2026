// `/{login}` : pseudo → propriétaire → canvas actif (§9.1, D-14). Le gateway, lui, ne connaît que le `canvasId`.

import { roleFor, type User } from "@liveplace/domain";
import type { DurableStore, SessionVerifier } from "@liveplace/domain/ports";

// Le profil du streamer pour la pill Canvas (CDC 2026). Sans photo Twitch, la clé est absente.
export type CanvasOwner = Pick<User, "displayName" | "login"> & { avatarUrl?: string };

// Qui regarde : le cookie de la requête et de quoi le vérifier. La vue OBS n'en donne pas : elle ne le lit pas.
export type CanvasVisit = { verifier: SessionVerifier; cookieHeader: string | undefined };

// `isOwnerSession` : pour l'affichage seulement, le gateway décide du rôle (§10.3). Absent sans `CanvasVisit`.
// `theme` (Écart §8.1, JOURNAL 2026-10-07) : celui de Convex, rendu avec la page ; le gateway prend ensuite le relais.
export type ResolvedCanvas = {
  canvasId: string;
  owner: CanvasOwner;
  theme?: string;
  isOwnerSession?: boolean;
};

// Le profil de la pill Canvas, sans photo quand Twitch n'en a pas donné.
export const toCanvasOwner = ({ displayName, login, avatarUrl }: User): CanvasOwner => ({
  displayName,
  login,
  ...(avatarUrl ? { avatarUrl } : {}),
});

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
  durable: Pick<DurableStore, "getUserByLogin" | "getActiveCanvasForOwner">,
  login: string,
  visit?: CanvasVisit,
): Promise<ResolvedCanvas | null> {
  const owner = await durable.getUserByLogin(login.toLowerCase());
  if (!owner) return null;
  const canvas = await durable.getActiveCanvasForOwner(owner.userId);
  if (!canvas) return null;
  return {
    canvasId: canvas.canvasId,
    owner: toCanvasOwner(owner),
    ...(canvas.theme ? { theme: canvas.theme } : {}),
    ...(visit ? { isOwnerSession: await isOwnerSession(visit, owner.userId) } : {}),
  };
}

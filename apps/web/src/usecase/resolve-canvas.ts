// `/{login}` : pseudo → propriétaire → canvas actif (§9.1, D-14). Le gateway, lui, ne connaît que le `canvasId`.

import type { User } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";

// Le profil du streamer pour la pill Canvas (CDC 2026). Sans photo Twitch, la clé est absente.
export type CanvasOwner = Pick<User, "displayName" | "login"> & { avatarUrl?: string };

export type ResolvedCanvas = { canvasId: string; owner: CanvasOwner };

export async function resolveCanvas(durable: DurableStore, login: string): Promise<ResolvedCanvas | null> {
  const owner = await durable.getUserByLogin(login.toLowerCase());
  if (!owner) return null;
  const canvas = await durable.getActiveCanvasForOwner(owner.userId);
  if (!canvas) return null;
  const { displayName, avatarUrl } = owner;
  return {
    canvasId: canvas.canvasId,
    owner: { displayName, login: owner.login, ...(avatarUrl ? { avatarUrl } : {}) },
  };
}

// `/{login}` : pseudo → propriétaire → canvas actif (§9.1, D-14). Le gateway, lui, ne connaît que le `canvasId`.

import type { DurableStore } from "@liveplace/domain/ports";

export type ResolvedCanvas = { canvasId: string; displayName: string };

export async function resolveCanvas(durable: DurableStore, login: string): Promise<ResolvedCanvas | null> {
  const owner = await durable.getUserByLogin(login.toLowerCase());
  if (!owner) return null;
  const canvas = await durable.getActiveCanvasForOwner(owner.userId);
  if (!canvas) return null;
  return { canvasId: canvas.canvasId, displayName: owner.displayName };
}

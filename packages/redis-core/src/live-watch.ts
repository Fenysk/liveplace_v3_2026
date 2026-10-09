// Le canal `live` de tous les canvas, vu du worker (Écart §7.2, JOURNAL 2026-10-06 et 2026-10-08).

import type { CanvasActivity, LiveMessage, Unsubscribe } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";

const LIVE_PATTERN = "cv:*:live";
const LIVE_CHANNEL = /^cv:(.+):live$/;

// Une seule connexion abonnée, au motif de tous les canaux : le worker voit tous les canvas (§7.2). Un événement dit sa
// version, un `ctl` non.
export async function watchLive(
  subscriber: Redis,
  onActivity: (activity: CanvasActivity) => void,
): Promise<Unsubscribe> {
  const listener = (_pattern: string, channel: string, raw: string): void => {
    const canvasId = LIVE_CHANNEL.exec(channel)?.[1];
    // Publié par nos scripts Lua ; la forme est couverte par les tests.
    const message: LiveMessage = JSON.parse(raw);
    if (canvasId === undefined) return;
    const isPlacement = "e" in message && message.e.kind === "place";
    const status = "ctl" in message && message.ctl.t === "canvasStatus" ? message.ctl.status : undefined;
    onActivity({
      canvasId,
      isPlacement,
      ...(status ? { status } : {}),
      ...("e" in message ? { version: message.e.version } : {}),
    });
  };
  subscriber.on("pmessage", listener);
  await subscriber.psubscribe(LIVE_PATTERN);
  return async () => {
    subscriber.off("pmessage", listener);
    await subscriber.punsubscribe(LIVE_PATTERN);
  };
}

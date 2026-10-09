// Une bulle ne s'affiche qu'une fois (Écart §8.1, JOURNAL 2026-10-08) : sa clé est retenue dans le navigateur de l'appareil.
// Le serveur ne connaît pas le stockage : il rend « déjà vue », et React relit à l'hydratation.

import { useSyncExternalStore } from "react";
import { createSeenBubbles } from "../../state/seen-bubbles";

export const seenBubbles = createSeenBubbles(() => window.localStorage);

const getServerSnapshot = (): boolean => true;

export function useSeenBubble(key: string) {
  const isSeen = useSyncExternalStore(
    seenBubbles.subscribe,
    () => seenBubbles.isSeen(key),
    getServerSnapshot,
  );
  return { isSeen, markSeen: () => seenBubbles.markSeen(key) };
}

const KEY_SEPARATOR = "|";

// Plusieurs bulles d'un coup (Écart §8.1, JOURNAL 2026-10-08) : la lecture se rend en une chaîne, un instantané que React compare.
export function useSeenBubbles<Key extends string>(keys: readonly Key[]): (key: Key) => boolean {
  const seen = useSyncExternalStore(
    seenBubbles.subscribe,
    () => keys.filter((key) => seenBubbles.isSeen(key)).join(KEY_SEPARATOR),
    () => keys.join(KEY_SEPARATOR),
  );
  return (key) => seen.split(KEY_SEPARATOR).includes(key);
}

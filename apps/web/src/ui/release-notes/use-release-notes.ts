// Le « lu » des Nouveautés, par appareil (seen-releases.ts). Le serveur rend « tout est lu », donc le HTML ne porte jamais de point ;
// React relit le stockage à l'hydratation.

import { useEffect, useSyncExternalStore } from "react";
import { hasUnreadRelease, type ReleaseAudience, seenKeysOf, seenKeysShown } from "./release-notes";
import { RELEASES } from "./release-notes-texts";
import { createSeenReleases } from "./seen-releases";

export const seenReleases = createSeenReleases(() => window.localStorage);

const ALL_KEYS = seenKeysOf(RELEASES);
const KEY_SEPARATOR = "|";

// L'état du lu se rend en une chaîne, un instantané que React compare : les clés lues, ou toutes côté serveur.
const getSnapshot = (): string => ALL_KEYS.filter((key) => seenReleases.isRead(key)).join(KEY_SEPARATOR);
const getServerSnapshot = (): string => ALL_KEYS.join(KEY_SEPARATOR);

// Le point d'un bouton Nouveautés : la dernière publication a une ligne pas encore lue pour ces publics.
export const useHasUnreadReleases = (audiences: readonly ReleaseAudience[]): boolean => {
  const read = useSyncExternalStore(seenReleases.subscribe, getSnapshot, getServerSnapshot);
  const seenKeys = read.split(KEY_SEPARATOR);
  return hasUnreadRelease(RELEASES, audiences, (key) => seenKeys.includes(key));
};

// Ouvrir la section ou la page marque comme lues les lignes de ces publics.
export const useMarkReleasesRead = (audiences: readonly ReleaseAudience[], isOpen: boolean): void => {
  useEffect(() => {
    if (!isOpen) return;
    for (const key of seenKeysShown(RELEASES, audiences)) seenReleases.markRead(key);
  }, [audiences, isOpen]);
};

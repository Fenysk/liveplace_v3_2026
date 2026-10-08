// Écart §5.4 (JOURNAL 2026-10-08) : un modérateur nommé ici ne se bannit pas, le serveur le refuse aussi ; le streamer lui
// retire d'abord son rôle. Venu de Twitch seul, il se bannit.

import type { InspectEntry } from "@liveplace/domain/ports";

export const canBan = ({ moderatorOrigin }: Pick<InspectEntry, "moderatorOrigin">): boolean =>
  moderatorOrigin?.isNamedHere !== true;

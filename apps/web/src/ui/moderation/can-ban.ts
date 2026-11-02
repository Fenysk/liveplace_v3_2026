// §5.4 : un modérateur nommé ici ne se bannit pas, le serveur le refuse aussi ; le streamer lui
// retire d'abord son rôle. Venu de Twitch seul, il se bannit. CDC §8 : l'auteur d'un compte supprimé non plus.

import type { InspectEntry } from "@liveplace/domain/ports";

export const canBan = ({
  moderatorOrigin,
  isDeleted,
}: Pick<InspectEntry, "moderatorOrigin" | "isDeleted">): boolean =>
  moderatorOrigin?.isNamedHere !== true && isDeleted !== true;

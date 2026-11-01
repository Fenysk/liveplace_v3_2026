// Quel chunk Convex range, et lequel il refuse (§7.1).

type Interval = { fromVersion: number; toVersion: number; count: number };

// Les chunks d'un canvas se suivent sans se recouvrir, des trous permis : un doublon, ou un worker qui repart d'un curseur
// trop bas, commence au plus à la dernière version rangée. Le dernier chunk porte la plus haute version.
export function judgeChunk(
  incoming: Interval,
  last: Pick<Interval, "toVersion"> | undefined,
): "accepted" | "overlap" | "invalid" {
  if (incoming.fromVersion > incoming.toVersion || incoming.count < 1) return "invalid";
  if (last && incoming.fromVersion <= last.toVersion) return "overlap";
  return "accepted";
}

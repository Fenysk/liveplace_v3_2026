// La section Nouveautés de la fenêtre (CDC 2026, Fenêtre) : les publications des publics du rôle sur cette fresque. L'ouvrir les marque lues.

import { ReleaseList } from "./release-list";
import type { ReleaseAudience } from "./release-notes";
import { useMarkReleasesRead } from "./use-release-notes";

type ReleaseNotesTabProps = { audiences: readonly ReleaseAudience[]; isOpen: boolean };

export const ReleaseNotesTab = ({ audiences, isOpen }: ReleaseNotesTabProps) => {
  useMarkReleasesRead(audiences, isOpen);
  return <ReleaseList audiences={audiences} level={3} />;
};

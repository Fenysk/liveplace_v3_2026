// Une archive introuvable (Écart §15, JOURNAL 2026-10-06) : un lien que personne ne reconnaît, ou une
// archive que son streamer a supprimée. Le lien cesse de répondre, et la page le dit sans rien révéler d'autre.
// `lp-game` : caché en vue OBS, aucun texte sur le stream.

import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { NoticePill } from "../design/pill";
import { useTexts } from "../locale/use-locale";
import { ARCHIVE_TEXTS } from "./archive-texts";

// `displayName` : absent quand le pseudo n'existe pas du tout, le bouton dit alors le pseudo.
type ArchiveNotFoundProps = { login: string; displayName?: string | undefined };

export const ArchiveNotFound = ({ login, displayName }: ArchiveNotFoundProps) => {
  const t = useTexts(ARCHIVE_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  return (
    <main className="lp-game">
      <NoticePill title={t.archiveNotFound}>
        <div className="lp-row">
          <Button label={design.viewCanvasOf(displayName ?? login)} href={`/${login}`} />
        </div>
      </NoticePill>
    </main>
  );
};

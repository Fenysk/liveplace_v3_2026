// La rangée Badges de Mon compte (CDC des badges §3, JOURNAL 2026-11-03) : le badge Soutien dans le rond d'un avatar, et son titre.
// Aucune date. Un Soutien expiré s'y montre à l'identique : il est masqué en public seulement, ici le viewer retrouve ce qu'il a
// donné. Sans aucun don, la rangée n'existe pas.

import { supportBadgeId } from "@liveplace/domain/badges";
import type { SupportTitle } from "@liveplace/domain/support";
import { BadgeGlyph } from "../design/user-badge";
import { badgeLabel } from "../design/user-badge-label";
import { WindowRow } from "../design/window";
import { useLocale, useTexts } from "../locale/use-locale";
import { ACCOUNT_TEXTS } from "./account-texts";

export const SupportBadgeRow = ({ title }: { title: SupportTitle }) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const locale = useLocale();
  return (
    <WindowRow label={t.badges}>
      <span className="lp-badge-line">
        <span className="lp-avatar lp-avatar--support" aria-hidden="true">
          <BadgeGlyph family="support" />
        </span>
        <span className="lp-profile-name lp-type-title">{badgeLabel(supportBadgeId(title), locale)}</span>
      </span>
    </WindowRow>
  );
};

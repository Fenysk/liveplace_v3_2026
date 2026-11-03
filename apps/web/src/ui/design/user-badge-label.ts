// Le texte d'un badge (CDC des badges §1 et §3, JOURNAL 2026-11-03) : l'infobulle et l'`aria-label` disent la même chose.
// Soutien dit son titre, « Soutien · Fidèle », ou « Soutien » seul au premier palier ; Modérateur dit ce qu'il fait.

import { type BadgeId, getBadge, toKnownBadges } from "@liveplace/domain/badges";
import type { Locale } from "../locale/locale";
import { DESIGN_TEXTS } from "./design-texts";

export const badgeLabel = (id: BadgeId, locale: Locale): string => {
  const t = DESIGN_TEXTS[locale];
  const badge = getBadge(id);
  if (badge.family === "moderator") return t.moderatorBadge;
  const family = t.supportTitles.supporter;
  return badge.title === "supporter" ? family : `${family} · ${t.supportTitles[badge.title]}`;
};

// Les ids reçus du serveur, un id inconnu ignoré : le texte de chacun, dans l'ordre du catalogue.
export const badgeLabels = (ids: readonly string[] | undefined, locale: Locale): string[] =>
  toKnownBadges(ids).map((id) => badgeLabel(id, locale));

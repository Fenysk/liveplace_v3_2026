// Les badges d'un viewer (CDC des badges §1 à §3, JOURNAL 2026-11-03) : le catalogue, et la composition à l'heure de
// l'affichage. Des fonctions pures : le gateway lit le miroir et les modérateurs de la fresque, jamais Convex (D-02).

import type { Timestamp } from "./index";
import { SUPPORT_TITLES, type SupportTitle } from "./support";

export type BadgeScope = "global" | "canvas";

type SupportBadgeId = `support.${SupportTitle}`;

// Une seule famille Soutien : le titre change, jamais l'icône. Un id ne se réutilise jamais : un badge retiré garde le sien.
export type BadgeEntry =
  | { id: "moderator"; scope: "canvas"; family: "moderator" }
  | { id: SupportBadgeId; scope: "global"; family: "support"; title: SupportTitle };

// L'ordre du tableau est celui de l'écran : Modérateur, puis Soutien (choix d'Alexis du 03/11).
export const BADGES = [
  { id: "moderator", scope: "canvas", family: "moderator" },
  { id: "support.supporter", scope: "global", family: "support", title: "supporter" },
  { id: "support.regular", scope: "global", family: "support", title: "regular" },
  { id: "support.drivingForce", scope: "global", family: "support", title: "drivingForce" },
  { id: "support.pillar", scope: "global", family: "support", title: "pillar" },
  { id: "support.keystone", scope: "global", family: "support", title: "keystone" },
] as const satisfies readonly BadgeEntry[];

export type BadgeId = (typeof BADGES)[number]["id"];

const POSITIONS: ReadonlyMap<string, number> = new Map(BADGES.map(({ id }, index) => [id, index]));

export const isBadgeId = (id: string): id is BadgeId => POSITIONS.has(id);

export const getBadge = (id: BadgeId): BadgeEntry => {
  const entry = BADGES[POSITIONS.get(id) ?? 0];
  if (!entry) throw new Error(`badge inconnu : ${id}`);
  return entry;
};

export const supportBadgeId = (title: SupportTitle): BadgeId => `support.${title}`;

// Ce qu'un client reçoit : un id qu'il ne connaît pas (un catalogue plus récent) est ignoré, sans erreur, et le reste se range dans
// l'ordre du catalogue, sans doublon.
export const toKnownBadges = (ids: readonly string[] | undefined): BadgeId[] =>
  [...new Set(ids ?? [])]
    .filter(isBadgeId)
    .sort((left, right) => (POSITIONS.get(left) ?? 0) - (POSITIONS.get(right) ?? 0));

// Le Soutien tel que le web l'écrit dans le miroir `user:<userId>` : le titre, et l'instant où le badge s'éteint.
export type SupportMirror = { title: SupportTitle; endsAt: Timestamp };

// Un champ du miroir abîmé ou d'un titre qu'on ne connaît plus ne donne aucun badge, plutôt qu'une erreur à l'affichage.
export const parseSupportMirror = (
  title: string | undefined,
  endsAt: string | undefined,
): SupportMirror | null => {
  const knownTitle = SUPPORT_TITLES.find((candidate) => candidate === title);
  const end = Number(endsAt);
  if (!knownTitle || endsAt === undefined || !Number.isFinite(end)) return null;
  return { title: knownTitle, endsAt: end };
};

export type BadgeFacts = {
  isModerator: boolean; // modère cette fresque, et n'est pas banni : un banni ne modère pas (§10.3)
  support?: SupportMirror | null | undefined;
};

// Le badge Soutien s'éteint à `endsAt` : un badge expiré ne part pas, sans aucune tâche planifiée.
export const composeBadges = ({ isModerator, support }: BadgeFacts, nowMs: Timestamp): BadgeId[] => {
  const badges: BadgeId[] = [];
  if (isModerator) badges.push("moderator");
  if (support && nowMs < support.endsAt) badges.push(supportBadgeId(support.title));
  return badges;
};

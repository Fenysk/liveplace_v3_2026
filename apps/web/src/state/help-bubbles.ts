// Les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) : des conseils, chacun posé une fois par appareil, au moment où il sert.
// Une seule bulle à la fois, la plus prioritaire que l'écran demande. Des données pures : la page lit les stores et affiche.

import { canModerate, type Role } from "@liveplace/domain";

// La section Vue OBS de la fenêtre du compte (`AccountSection`, qui est dans `ui/`).
const OBS_SECTION = "obs";

// Dans l'ordre de priorité : ce qui attend un geste de la personne d'abord (modérer, brancher OBS, réclamer), puis ce qui
// explique son état (la jauge vide), puis les deux guides du Dessin, qui ne servent que si elle y est. Les deux bulles OBS de la
// fenêtre (l'onglet, l'adresse) suivent Réglages : la chaîne du streamer (Écart §8.1, JOURNAL 2026-10-09).
export const HELP_BUBBLES = [
  "pending-report",
  "obs-settings",
  "obs-tab",
  "obs-address",
  "first-reward",
  "empty-gauge",
  "draft-trace",
  "first-draft",
] as const;
export type HelpBubble = (typeof HELP_BUBBLES)[number];

// Ce que montre la pill Dessin : Vue ou Dessin. Ni l'un ni l'autre (connexion, invité, banni) : `undefined`, pas de cible.
export type HelpPill = "view" | "draft";

export type HelpFacts = {
  role: Role | undefined;
  pill: HelpPill | undefined;
  isTouchScreen: boolean;
  isTouchTracing: boolean;
  hasPannedInDraft: boolean; // un doigt a glissé en Dessin, Tracé éteint : la vue a bougé au lieu de dessiner
  draftSize: number;
  charges: number | undefined; // la jauge prédite ; absente pour un invité
  canClaim: boolean;
  pendingReports: number;
  windowSection: string | undefined; // la section de la fenêtre du compte ouverte ; absente si elle est fermée
};

// Ce qui ferme une bulle montrée, et la fait retenir comme vue : la personne agit à nouveau (`press`), ou ce qu'elle disait
// n'est plus vrai (`done`). Les deux bulles qui attendent leur geste précis (une fenêtre ouverte) n'ont ni l'un ni l'autre.
export type Closing = "press" | "done";

// Ce que demande l'écran pour chaque bulle, sans tenir compte des autres ni de ce que l'appareil a déjà vu. Les trois premières
// ne se montrent qu'en Vue (la pill Compte s'efface en Dessin sur mobile, le +1 n'y existe pas) ; la jauge, des deux côtés.
const WISHES: Record<HelpBubble, (facts: HelpFacts) => boolean> = {
  "pending-report": ({ role, pill, pendingReports }) =>
    pill === "view" && role !== undefined && canModerate(role) && pendingReports > 0,
  "obs-settings": ({ role, pill }) => pill === "view" && role === "owner",
  // Le streamer, la fenêtre ouverte ailleurs que sur Vue OBS : l'onglet. Dans Vue OBS : l'adresse.
  "obs-tab": ({ role, windowSection }) =>
    role === "owner" && windowSection !== undefined && windowSection !== OBS_SECTION,
  "obs-address": ({ role, windowSection }) => role === "owner" && windowSection === OBS_SECTION,
  "first-reward": ({ pill, canClaim }) => pill === "view" && canClaim,
  "empty-gauge": ({ pill, charges }) => pill !== undefined && charges === 0,
  "draft-trace": ({ pill, isTouchScreen, isTouchTracing, hasPannedInDraft }) =>
    pill === "draft" && isTouchScreen && !isTouchTracing && hasPannedInDraft,
  "first-draft": ({ pill, draftSize }) => pill === "draft" && draftSize === 0,
};

export const isWished = (bubble: HelpBubble, facts: HelpFacts): boolean => WISHES[bubble](facts);

// Écart §8.1 (JOURNAL 2026-10-09) : les bulles de la fenêtre du compte ne se montrent que fenêtre ouverte, les autres fenêtre fermée.
const IN_WINDOW: readonly HelpBubble[] = ["obs-tab", "obs-address"];

export const isInWindow = (bubble: HelpBubble): boolean => IN_WINDOW.includes(bubble);

// La plus prioritaire que l'écran demande et que l'appareil n'a pas vue, dans la fenêtre ouverte ou sur l'écran. Une bulle qui
// attend n'est pas retenue comme vue : sa condition peut tenir encore plus tard, sinon elle attend sa prochaine occasion.
export const pickHelpBubble = (
  facts: HelpFacts,
  isSeen: (bubble: HelpBubble) => boolean,
): HelpBubble | undefined => {
  const isWindowOpen = facts.windowSection !== undefined;
  return HELP_BUBBLES.find(
    (bubble) => isInWindow(bubble) === isWindowOpen && !isSeen(bubble) && isWished(bubble, facts),
  );
};

const CLOSINGS: Record<HelpBubble, readonly Closing[]> = {
  "pending-report": [],
  "obs-settings": [],
  "obs-tab": ["done"],
  "obs-address": ["done"],
  "first-reward": ["press", "done"],
  "empty-gauge": ["press", "done"],
  "draft-trace": ["press"],
  "first-draft": ["done"],
};

export const isClosedBy = (bubble: HelpBubble, closing: Closing): boolean =>
  CLOSINGS[bubble].includes(closing);

// Une bulle montrée dont la condition a cessé a servi : elle est retenue comme vue (Écart §8.1, JOURNAL 2026-10-09 : l'onglet aussi,
// que la fenêtre ait fermé ou le streamer changé de section, sans jamais revenir).
export const isDone = (bubble: HelpBubble, facts: HelpFacts): boolean =>
  isClosedBy(bubble, "done") && !isWished(bubble, facts);

// Ouvrir la fenêtre sur la section qui répond à la bulle la fait trouver : elle n'a plus rien à dire. Ouvrir Vue OBS, c'est aussi
// avoir trouvé son onglet : un streamer qui y va directement saute la bulle de l'onglet.
const FOUND_IN_SECTION: Readonly<Record<string, readonly HelpBubble[]>> = {
  moderation: ["pending-report"],
  canvas: ["obs-settings"],
  [OBS_SECTION]: ["obs-settings", "obs-tab"],
};

export const bubblesFoundIn = (sectionId: string): readonly HelpBubble[] => FOUND_IN_SECTION[sectionId] ?? [];

// La chaîne du streamer, de Réglages à l'adresse : copier l'adresse la finit, le streamer n'en voit plus rien.
export const OBS_CHAIN: readonly HelpBubble[] = ["obs-settings", "obs-tab", "obs-address"];

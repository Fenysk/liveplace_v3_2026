// Les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08) : des conseils, chacun posé une fois par appareil, au moment où il sert.
// Une seule bulle à la fois, la plus prioritaire que l'écran demande. Des données pures : la page lit les stores et affiche.

import { canModerate, type Role } from "@liveplace/domain";
import type { ModeratorList, RequestResult } from "./canvas-store";
import { PLACEMENT_COUNT_CAP } from "./placement-count";

// Les sections de la fenêtre du compte que les bulles connaissent (`AccountSection`, qui est dans `ui/`).
const OBS_SECTION = "obs";
const CANVAS_SECTION = "canvas";
const MODERATION_SECTION = "moderation";

// Dans l'ordre de priorité : ce qui attend un geste de la personne d'abord (modérer, brancher OBS, réclamer, trouver Modération),
// puis ce qui explique son état (la jauge vide), puis les deux guides du Dessin, qui répondent à ce qu'elle vient de faire, puis
// les trois conseils qui viennent avec les dessins posés (Écart §8.1, JOURNAL 2026-10-12). Les bulles OBS de la fenêtre suivent
// Réglages : la chaîne du streamer, de l'onglet Vue OBS à la synchronisation Twitch (JOURNAL 2026-10-09 et 2026-10-12).
export const HELP_BUBBLES = [
  "pending-report",
  "obs-settings",
  "obs-tab",
  "obs-address",
  "invite-link",
  "theme",
  "twitch-sync",
  "first-reward",
  "moderator-welcome",
  "moderation-actions",
  "empty-gauge",
  "draft-trace",
  "first-draft",
  "palette",
  "keys",
  "eyedropper",
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
  hasColorButton: boolean; // la feuille Dessin repliée montre le bouton de la couleur actuelle : ni le grand écran ni le panneau du paysage
  draftSize: number;
  placementCount: number; // les dessins posés sur cet appareil, plafonnés (`PLACEMENT_COUNT_CAP`)
  charges: number | undefined; // la jauge prédite ; absente pour un invité
  canClaim: boolean;
  pendingReports: number;
  windowSection: string | undefined; // la section de la fenêtre du compte ouverte ; absente si elle est fermée
  isThemeMissing: boolean; // le gateway a répondu et la fresque n'a pas de thème
  isTwitchSyncMissing: boolean; // la synchro Twitch n'a jamais été faite : la liste des modérateurs n'en porte aucune
  isInspecting: boolean; // la pill Inspection montre une case
  canModerateInspected: boolean; // cette case est la pose d'un autre compte, et la pill montre ses actions de modération
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
  // Écart §8.1 (JOURNAL 2026-10-12) : la chaîne continue après l'adresse, qui passe avant (`HELP_BUBBLES`) : le lien à partager,
  // le thème dans la section Fresque, la synchro Twitch partout sauf dans Modération.
  "invite-link": ({ role, windowSection }) => role === "owner" && windowSection === OBS_SECTION,
  theme: ({ role, windowSection, isThemeMissing }) =>
    role === "owner" && windowSection === CANVAS_SECTION && isThemeMissing,
  "twitch-sync": ({ role, windowSection, isTwitchSyncMissing }) =>
    role === "owner" &&
    windowSection !== undefined &&
    windowSection !== MODERATION_SECTION &&
    isTwitchSyncMissing,
  "first-reward": ({ pill, canClaim }) => pill === "view" && canClaim,
  // Écart §8.1 (JOURNAL 2026-10-12) : qui modère sans être le streamer trouve sa pill Modération ; et l'inspection d'une pose d'un
  // autre compte lui montre où retirer ses pixels ou le bannir.
  "moderator-welcome": ({ role, pill }) => pill === "view" && role === "moderator",
  "moderation-actions": ({ canModerateInspected }) => canModerateInspected,
  "empty-gauge": ({ pill, charges }) => pill !== undefined && charges === 0,
  "draft-trace": ({ pill, isTouchScreen, isTouchTracing, hasPannedInDraft }) =>
    pill === "draft" && isTouchScreen && !isTouchTracing && hasPannedInDraft,
  "first-draft": ({ pill, draftSize }) => pill === "draft" && draftSize === 0,
  // Écart §8.1 (JOURNAL 2026-10-12) : en Dessin, une fois un premier dessin posé, ce qui reste à apprendre. Au doigt, la palette
  // complète s'ouvre par la couleur actuelle ; à la souris, Ctrl+Z, dès qu'il y a un pixel à annuler ; la pipette, au troisième dessin,
  // des deux côtés.
  palette: ({ pill, isTouchScreen, hasColorButton, placementCount }) =>
    pill === "draft" && isTouchScreen && hasColorButton && placementCount >= 1,
  keys: ({ pill, isTouchScreen, placementCount, draftSize }) =>
    pill === "draft" && !isTouchScreen && placementCount >= 1 && draftSize > 0,
  eyedropper: ({ pill, placementCount }) => pill === "draft" && placementCount >= PLACEMENT_COUNT_CAP,
};

export const isWished = (bubble: HelpBubble, facts: HelpFacts): boolean => WISHES[bubble](facts);

// La synchro Twitch jamais faite (Écart §8.1, JOURNAL 2026-10-12) : la liste des modérateurs n'en porte aucune. Un échec ne dit rien.
export const isTwitchSyncNever = (answer: RequestResult<ModeratorList>): boolean =>
  answer.ok && answer.value.twitchSync === undefined;

// Où vit une bulle (Écart §8.1, JOURNAL 2026-10-09 et 2026-10-12) : la fenêtre du compte, ouverte, pour celles de la fenêtre ; la pill
// Inspection, ouverte, pour celle des actions de modération ; l'écran sans l'un ni l'autre pour les autres. Une seule surface
// compte à la fois, jamais deux bulles.
export type BubbleSurface = "screen" | "window" | "inspection";

const OFF_SCREEN: Partial<Record<HelpBubble, Exclude<BubbleSurface, "screen">>> = {
  "obs-tab": "window",
  "obs-address": "window",
  "invite-link": "window",
  theme: "window",
  "twitch-sync": "window",
  "moderation-actions": "inspection",
};

export const surfaceOf = (bubble: HelpBubble): BubbleSurface => OFF_SCREEN[bubble] ?? "screen";

export const isInWindow = (bubble: HelpBubble): boolean => surfaceOf(bubble) === "window";

// La surface de l'instant : la fenêtre passe avant l'inspection, qui passe avant l'écran.
export const surfaceShown = ({ windowSection, isInspecting }: HelpFacts): BubbleSurface => {
  if (windowSection !== undefined) return "window";
  return isInspecting ? "inspection" : "screen";
};

// La plus prioritaire que l'écran demande et que l'appareil n'a pas vue, sur la surface de l'instant. Une bulle qui attend n'est
// pas retenue comme vue : sa condition peut tenir encore plus tard, sinon elle attend sa prochaine occasion.
export const pickHelpBubble = (
  facts: HelpFacts,
  isSeen: (bubble: HelpBubble) => boolean,
): HelpBubble | undefined => {
  const surface = surfaceShown(facts);
  return HELP_BUBBLES.find(
    (bubble) => surfaceOf(bubble) === surface && !isSeen(bubble) && isWished(bubble, facts),
  );
};

const CLOSINGS: Record<HelpBubble, readonly Closing[]> = {
  "pending-report": [],
  "obs-settings": [],
  "obs-tab": ["done"],
  "obs-address": ["done"],
  "invite-link": ["done"], // la copie suivante la clôt aussi (`bubblesEndedByCopy`)
  theme: ["done"],
  "twitch-sync": ["done"],
  "first-reward": ["press", "done"],
  "moderator-welcome": [],
  "moderation-actions": ["press", "done"],
  "empty-gauge": ["press", "done"],
  "draft-trace": ["press"],
  "first-draft": ["done"],
  palette: ["done"], // ouvrir la palette la clôt (`useHelpBubbles`), comme sortir du Dessin
  keys: ["press", "done"],
  eyedropper: ["press", "done"],
};

export const isClosedBy = (bubble: HelpBubble, closing: Closing): boolean =>
  CLOSINGS[bubble].includes(closing);

// Une bulle montrée dont la condition a cessé a servi : elle est retenue comme vue (Écart §8.1, JOURNAL 2026-10-09 : l'onglet aussi,
// que la fenêtre ait fermé ou le streamer changé de section, sans jamais revenir).
export const isDone = (bubble: HelpBubble, facts: HelpFacts): boolean =>
  isClosedBy(bubble, "done") && !isWished(bubble, facts);

// Écart §8.1 (JOURNAL 2026-10-12) : après l'action qui la ferme, une bulle de tutoriel peut rester le temps d'être lue. La même durée
// que le dernier point du conseil de première visite : une seule constante.
export const BUBBLE_LINGER_MS = 2000;

// Les bulles qui restent, chacune tant que ce qu'elle désigne est à l'écran : sortir du Dessin emporte Valider, et sa bulle part
// aussitôt. Les autres partent dès l'action (l'écran suivant prend le relais, ou l'action se voit : le +1 réclamé, le Tracé touché).
// Ctrl+Z et la pipette (JOURNAL 2026-10-12) se lisent en faisant leur geste suivant : elles restent en Dessin.
const LINGERS_WHILE: Partial<Record<HelpBubble, (facts: HelpFacts) => boolean>> = {
  "first-draft": ({ pill }) => pill === "draft",
  "empty-gauge": ({ pill }) => pill !== undefined,
  keys: ({ pill }) => pill === "draft",
  eyedropper: ({ pill }) => pill === "draft",
};

// La bulle montrée est close (l'action suivante l'a vue, ou ce qu'elle disait n'est plus vrai) et reste à l'écran.
export const isLingering = (
  bubble: HelpBubble,
  facts: HelpFacts,
  isSeen: (bubble: HelpBubble) => boolean,
): boolean => (isSeen(bubble) || isDone(bubble, facts)) && LINGERS_WHILE[bubble]?.(facts) === true;

// Ouvrir la fenêtre sur la section qui répond à la bulle la fait trouver : elle n'a plus rien à dire. Ouvrir Vue OBS, c'est aussi
// avoir trouvé son onglet : un streamer qui y va directement saute la bulle de l'onglet.
const FOUND_IN_SECTION: Readonly<Record<string, readonly HelpBubble[]>> = {
  moderation: ["pending-report", "moderator-welcome", "twitch-sync"],
  canvas: ["obs-settings"],
  [OBS_SECTION]: ["obs-settings", "obs-tab"],
};

export const bubblesFoundIn = (sectionId: string): readonly HelpBubble[] => FOUND_IN_SECTION[sectionId] ?? [];

// La chaîne du streamer, de Réglages à l'adresse : copier l'adresse la finit, le streamer n'en voit plus rien.
export const OBS_CHAIN: readonly HelpBubble[] = ["obs-settings", "obs-tab", "obs-address"];

// Copier le bouton de Vue OBS (Écart §8.1, JOURNAL 2026-10-09 et 2026-10-12) : la première copie finit la chaîne OBS ; la suivante,
// quand l'adresse est vue et que la bulle du partage a pris sa place sur le même bouton, finit celle-ci.
export const bubblesEndedByCopy = (isSeen: (bubble: HelpBubble) => boolean): readonly HelpBubble[] =>
  isSeen("obs-address") ? [...OBS_CHAIN, "invite-link"] : OBS_CHAIN;

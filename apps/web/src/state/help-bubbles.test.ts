import { describe, expect, it } from "vitest";
import {
  BUBBLE_LINGER_MS,
  bubblesEndedByCopy,
  bubblesFoundIn,
  HELP_BUBBLES,
  type HelpBubble,
  type HelpFacts,
  isClosedBy,
  isDone,
  isInWindow,
  isLingering,
  isTwitchSyncNever,
  isWished,
  OBS_CHAIN,
  pickHelpBubble,
  surfaceOf,
  surfaceShown,
} from "./help-bubbles";
import { PLACEMENT_COUNT_CAP } from "./placement-count";

// Un viewer tactile qui regarde, sans rien à signaler : aucune bulle n'est demandée.
const resting: HelpFacts = {
  role: "viewer",
  pill: "view",
  isTouchScreen: true,
  isTouchTracing: false,
  hasPannedInDraft: false,
  hasColorButton: false,
  draftSize: 0,
  placementCount: 0,
  charges: 5,
  canClaim: false,
  pendingReports: 0,
  windowSection: undefined,
  isThemeMissing: false,
  isTwitchSyncMissing: false,
  isInspecting: false,
  canModerateInspected: false,
};

const drafting: HelpFacts = { ...resting, pill: "draft" };
const wishedIn = (facts: HelpFacts): HelpBubble[] => HELP_BUBBLES.filter((bubble) => isWished(bubble, facts));
const neverSeen = () => false;

describe("les bulles d'aide (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Au repos, un viewer qui regarde n'a besoin d'aucun conseil
  it("wishes nothing for a viewer who is just looking", () => {
    expect(wishedIn(resting)).toEqual([]);
  });

  // Premier signalement : qui modère le voit dans la pill Compte, en Vue seulement
  it("wishes the pending report for who moderates, in View only", () => {
    expect(wishedIn({ ...resting, role: "moderator", pendingReports: 1 })).toEqual([
      "pending-report",
      "moderator-welcome",
    ]);
    expect(wishedIn({ ...resting, role: "owner", pendingReports: 3 })).toContain("pending-report");
    expect(wishedIn({ ...resting, role: "moderator", pendingReports: 0 })).toEqual(["moderator-welcome"]);
    expect(wishedIn({ ...drafting, role: "moderator", pendingReports: 1 })).toEqual(["first-draft"]);
    expect(wishedIn({ ...resting, role: "viewer", pendingReports: 1 })).toEqual([]);
  });

  // Le streamer sur son canvas, en Vue : OBS se branche dans Réglages
  it("wishes the OBS bubble for the owner on his canvas, in View only", () => {
    expect(wishedIn({ ...resting, role: "owner" })).toEqual(["obs-settings"]);
    expect(wishedIn({ ...resting, role: "moderator" })).toEqual(["moderator-welcome"]);
    expect(wishedIn({ ...drafting, role: "owner" })).not.toContain("obs-settings");
  });

  // Une récompense à réclamer : le +1 n'existe qu'en Vue
  it("wishes the first reward when one waits, in View only", () => {
    expect(wishedIn({ ...resting, canClaim: true })).toEqual(["first-reward"]);
    expect(wishedIn({ ...drafting, canClaim: true })).not.toContain("first-reward");
  });

  // Jauge vide : en Vue comme en Dessin, jamais pour qui n'a pas de jauge ni quand il reste une charge
  it("wishes the empty gauge at zero charges, in View and in Draft", () => {
    expect(wishedIn({ ...resting, charges: 0 })).toEqual(["empty-gauge"]);
    expect(wishedIn({ ...drafting, charges: 0, draftSize: 1 })).toEqual(["empty-gauge"]);
    expect(wishedIn({ ...resting, charges: 1 })).toEqual([]);
    expect(wishedIn({ ...resting, charges: undefined, pill: undefined })).toEqual([]);
    expect(wishedIn({ ...resting, charges: 0, pill: undefined })).toEqual([]);
  });

  // Tracé : un doigt a glissé en Dessin sur un écran tactile, Tracé éteint
  it("wishes the trace once a finger moved the view in Draft on a touch screen with Trace off", () => {
    const panned = { ...drafting, hasPannedInDraft: true, draftSize: 2 };
    expect(wishedIn(panned)).toEqual(["draft-trace"]);
    expect(wishedIn({ ...panned, isTouchScreen: false })).toEqual(["draft-space"]);
    expect(wishedIn({ ...panned, isTouchTracing: true })).toEqual([]);
    expect(wishedIn({ ...panned, hasPannedInDraft: false })).toEqual([]);
    expect(wishedIn({ ...resting, hasPannedInDraft: true })).toEqual([]);
  });

  // Premier passage en Dessin : tant que le brouillon est vide, sur PC comme sur mobile
  it("wishes the first Draft pass while the draft is empty, on a PC as on a phone", () => {
    expect(wishedIn(drafting)).toEqual(["first-draft"]);
    expect(wishedIn({ ...drafting, isTouchScreen: false })).toEqual(["first-draft"]);
    expect(wishedIn({ ...drafting, draftSize: 1 })).toEqual([]);
  });

  // Une seule à la fois : celle qui attend un geste d'abord, puis l'état de la personne, puis le Dessin
  it("picks the most urgent of the bubbles the screen asks for, one at a time", () => {
    const everything: HelpFacts = {
      ...resting,
      role: "owner",
      pendingReports: 2,
      canClaim: true,
      charges: 0,
    };
    const seen = new Set<HelpBubble>();
    const picked: HelpBubble[] = [];
    for (let turn = 0; turn < 4; turn++) {
      const next = pickHelpBubble(everything, (bubble) => seen.has(bubble));
      if (!next) break;
      picked.push(next);
      seen.add(next);
    }
    expect(picked).toEqual(["pending-report", "obs-settings", "first-reward", "empty-gauge"]);
  });

  // Dans le Dessin, le Tracé passe devant le premier passage : il répond au geste qui vient d'avoir lieu
  it("puts the trace before the first Draft pass, which waits", () => {
    const panned = { ...drafting, hasPannedInDraft: true };
    expect(pickHelpBubble(panned, neverSeen)).toBe("draft-trace");
    expect(pickHelpBubble(panned, (bubble) => bubble === "draft-trace")).toBe("first-draft");
  });

  // Une bulle déjà vue ne revient jamais, même si sa condition tient encore
  it("never picks a bubble already seen, whatever its condition", () => {
    const wishing = { ...resting, charges: 0 };
    expect(pickHelpBubble(wishing, (bubble) => bubble === "empty-gauge")).toBeUndefined();
  });

  // Ce qui clôt une bulle montrée : l'action suivante pour sept d'entre elles, la fin de leur condition pour douze autres
  it("closes the bubbles that ask for no precise gesture on the next press or when they are done", () => {
    const closedBy = (closing: "press" | "done") => HELP_BUBBLES.filter((b) => isClosedBy(b, closing));
    expect(closedBy("press")).toEqual([
      "first-reward",
      "moderation-actions",
      "empty-gauge",
      "draft-trace",
      "draft-space",
      "keys",
      "eyedropper",
    ]);
    expect(closedBy("done")).toEqual([
      "obs-tab",
      "obs-address",
      "invite-link",
      "theme",
      "twitch-sync",
      "first-reward",
      "moderation-actions",
      "empty-gauge",
      "first-draft",
      "palette",
      "keys",
      "eyedropper",
    ]);
  });

  // Ouvrir la fenêtre sur la bonne section fait trouver la bulle : Modération pour les signalements, Canvas ou Vue OBS pour OBS
  it("finds the bubbles through the window section that answers them", () => {
    expect(bubblesFoundIn("moderation")).toEqual(["pending-report", "moderator-welcome", "twitch-sync"]);
    expect(bubblesFoundIn("canvas")).toEqual(["obs-settings"]);
    expect(bubblesFoundIn("obs")).toEqual(["obs-settings", "obs-tab"]);
    expect(bubblesFoundIn("account")).toEqual([]);
    expect(bubblesFoundIn("scoreboard")).toEqual([]);
  });
});

// Le streamer, une fois par appareil : Réglages, puis l'onglet Vue OBS, puis l'adresse à copier (Écart §8.1, JOURNAL 2026-10-09)
describe("la chaîne des bulles OBS (Écart §8.1, JOURNAL 2026-10-09)", () => {
  const owner: HelpFacts = { ...resting, role: "owner" };
  const inWindow = (windowSection: string, facts: HelpFacts = owner): HelpFacts => ({
    ...facts,
    windowSection,
  });

  // Cinq vivent dans la fenêtre (l'onglet, l'adresse, puis le lien, le thème, la synchro Twitch) ; les autres, sur l'écran
  it("lives in the window for the five of the streamer's chain, on the screen for the others", () => {
    expect(HELP_BUBBLES.filter(isInWindow)).toEqual([
      "obs-tab",
      "obs-address",
      "invite-link",
      "theme",
      "twitch-sync",
    ]);
  });

  // La fenêtre ouverte sur une autre section que Vue OBS : l'onglet est montré au streamer seul
  it("wishes the tab for the owner while the window is open on any section but Vue OBS", () => {
    for (const section of ["canvas", "canvases", "moderation", "account"])
      expect(wishedIn(inWindow(section))).toContain("obs-tab");
    expect(wishedIn(inWindow("obs"))).not.toContain("obs-tab");
    expect(wishedIn(owner)).not.toContain("obs-tab");
    expect(wishedIn(inWindow("canvas", { ...resting, role: "moderator" }))).not.toContain("obs-tab");
    expect(wishedIn(inWindow("canvas", { ...resting, role: "viewer" }))).not.toContain("obs-tab");
  });

  // L'adresse : dans Vue OBS seulement, pour le streamer seul
  it("wishes the address for the owner in the Vue OBS section only", () => {
    expect(wishedIn(inWindow("obs"))).toContain("obs-address");
    for (const section of ["canvas", "canvases", "moderation", "account"])
      expect(wishedIn(inWindow(section))).not.toContain("obs-address");
    expect(wishedIn(owner)).not.toContain("obs-address");
    expect(wishedIn(inWindow("obs", { ...resting, role: "moderator" }))).not.toContain("obs-address");
  });

  // Une seule à la fois, toujours : la fenêtre ouverte, seules ses bulles passent, même quand un signalement attend dehors
  it("picks only the window bubbles while the window is open, and only the screen ones while it is closed", () => {
    const busy: HelpFacts = { ...owner, pendingReports: 2, canClaim: true, charges: 0 };

    expect(pickHelpBubble(inWindow("canvas", busy), neverSeen)).toBe("obs-tab");
    expect(pickHelpBubble(inWindow("obs", busy), neverSeen)).toBe("obs-address");
    expect(pickHelpBubble(busy, neverSeen)).toBe("pending-report");
    expect(pickHelpBubble(inWindow("canvas", busy), (bubble) => bubble === "obs-tab")).toBeUndefined();
    expect(pickHelpBubble(inWindow("obs", busy), (bubble) => bubble === "obs-address")).toBe("invite-link");
  });

  // La chaîne dans l'ordre : Réglages, puis l'onglet, puis l'adresse, chacune quand sa condition tient et que la précédente est partie
  it("chains Réglages, the tab and the address, one at a time", () => {
    const seen = new Set<HelpBubble>();
    const pick = (facts: HelpFacts): HelpBubble | undefined =>
      pickHelpBubble(facts, (bubble) => seen.has(bubble));

    expect(pick(owner)).toBe("obs-settings");
    for (const bubble of bubblesFoundIn("canvas")) seen.add(bubble);
    expect(pick(owner)).toBeUndefined();
    expect(pick(inWindow("canvas"))).toBe("obs-tab");
    for (const bubble of bubblesFoundIn("obs")) seen.add(bubble);
    expect(pick(inWindow("obs"))).toBe("obs-address");
    seen.add("obs-address");
    expect(pick(inWindow("obs"))).toBe("invite-link");
    seen.add("invite-link");
    expect(pick(inWindow("obs"))).toBeUndefined();
    expect(pick(inWindow("canvas"))).toBeUndefined();
  });

  // Un streamer qui va directement sur Vue OBS saute l'onglet : ouvrir la section le fait trouver, même sans l'avoir vu
  it("skips the tab for an owner who goes straight to Vue OBS", () => {
    const seen = new Set<HelpBubble>(bubblesFoundIn("obs"));

    expect(pickHelpBubble(inWindow("obs"), (bubble) => seen.has(bubble))).toBe("obs-address");
    expect(pickHelpBubble(inWindow("canvas"), (bubble) => seen.has(bubble))).toBeUndefined();
  });

  // Celui qui a copié l'adresse ne voit plus rien de la chaîne OBS, où qu'il soit : seul le lien à partager suit, dans Vue OBS
  it("shows nothing of the OBS chain once the address is copied, only the link to share follows in Vue OBS", () => {
    const seen = new Set<HelpBubble>(OBS_CHAIN);

    expect(OBS_CHAIN).toEqual(["obs-settings", "obs-tab", "obs-address"]);
    for (const facts of [owner, inWindow("canvas"), inWindow("account")])
      expect(pickHelpBubble(facts, (bubble) => seen.has(bubble))).toBeUndefined();
    expect(pickHelpBubble(inWindow("obs"), (bubble) => seen.has(bubble))).toBe("invite-link");
  });

  // Quitter l'onglet (ou fermer la fenêtre) après avoir vu l'adresse : sa condition cesse, elle est retenue comme vue
  it("ends the address when the window leaves Vue OBS or closes", () => {
    expect(isDone("obs-address", inWindow("canvas"))).toBe(true);
    expect(isDone("obs-address", owner)).toBe(true);
    expect(isDone("obs-address", inWindow("obs"))).toBe(false);
  });

  // L'onglet n'est montré qu'une fois (JOURNAL 2026-10-09) : la fenêtre fermée sans l'ouvrir, ou Vue OBS ouvert, il est retenu vu ;
  // changer d'une autre section à une autre ne le clôt pas, il sert encore
  it("ends the tab once the window closes or Vue OBS opens, not while another section is shown", () => {
    expect(isDone("obs-tab", owner)).toBe(true);
    expect(isDone("obs-tab", inWindow("obs"))).toBe(true);
    for (const section of ["canvas", "canvases", "moderation", "account"])
      expect(isDone("obs-tab", inWindow(section))).toBe(false);
  });

  // Montrée une fois, puis la fenêtre fermée sans ouvrir l'onglet : elle ne revient pas à la réouverture
  it("does not bring the tab back when the window is reopened after it was shown and closed unused", () => {
    const seen = new Set<HelpBubble>(bubblesFoundIn("canvas"));
    const pick = (facts: HelpFacts): HelpBubble | undefined =>
      pickHelpBubble(facts, (bubble) => seen.has(bubble));

    expect(pick(inWindow("canvas"))).toBe("obs-tab");
    // La fenêtre se ferme : la bulle montrée n'a plus de condition, la page la retient comme vue
    expect(isDone("obs-tab", owner)).toBe(true);
    seen.add("obs-tab");
    expect(pick(inWindow("canvas"))).toBeUndefined();
    expect(pick(inWindow("account"))).toBeUndefined();
    // L'adresse reste pour qui ouvre Vue OBS plus tard : sa propre fin est la copie, ou quitter l'onglet
    expect(pick(inWindow("obs"))).toBe("obs-address");
  });

  // Réglages et l'adresse gardent leur comportement : Réglages attend son geste, l'adresse n'a pas d'autre fin que les siennes
  it("keeps Réglages waiting for its gesture", () => {
    expect(isDone("obs-settings", owner)).toBe(false);
    expect(isDone("obs-settings", inWindow("canvas"))).toBe(false);
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : quatre bulles de tutoriel restent après l'action qui les ferme, tant que leur cible est à l'écran ;
// les autres partent aussitôt. Le temps qu'elles restent est une seule constante, celle du conseil de première visite.
describe("les bulles qui restent après l'action qui les ferme (Écart §8.1, JOURNAL 2026-10-12)", () => {
  const alwaysSeen = () => true;

  // Deux secondes, comme le dernier point du conseil de première visite
  it("stays two seconds, the same time as the last dot of the first-visit hint", () => {
    expect(BUBBLE_LINGER_MS).toBe(2000);
  });

  // La première case clôt le premier passage (`done`) : sa fin, « Valider l'envoie », se lit encore, en Dessin
  it("keeps the first Draft pass after the first cell, while Draft is on screen", () => {
    expect(isLingering("first-draft", { ...drafting, draftSize: 1 }, neverSeen)).toBe(true);
    expect(isLingering("first-draft", { ...drafting, draftSize: 1 }, alwaysSeen)).toBe(true);
  });

  // Sortir du Dessin emporte Valider : la bulle part aussitôt, qu'une case ait été posée ou non
  it("lets the first Draft pass go at once when Draft is left", () => {
    expect(isLingering("first-draft", { ...resting, draftSize: 1 }, neverSeen)).toBe(false);
    expect(isLingering("first-draft", resting, neverSeen)).toBe(false);
  });

  // La jauge : l'action suivante la ferme (elle est vue), ou une charge qui revient (`done`), elle explique la recharge qui arrive
  it("keeps the empty gauge after the next press or once a charge is back, wherever the pill is", () => {
    const empty = { ...resting, charges: 0 };
    expect(isLingering("empty-gauge", empty, alwaysSeen)).toBe(true);
    expect(isLingering("empty-gauge", { ...empty, pill: "draft", draftSize: 1 }, alwaysSeen)).toBe(true);
    expect(isLingering("empty-gauge", { ...resting, charges: 1 }, neverSeen)).toBe(true);
  });

  // Plus de pill (connexion, invité, banni) : plus de jauge à désigner, la bulle part aussitôt
  it("lets the empty gauge go at once when no pill shows the gauge any more", () => {
    expect(isLingering("empty-gauge", { ...resting, charges: 1, pill: undefined }, neverSeen)).toBe(false);
    expect(isLingering("empty-gauge", { ...resting, charges: 0, pill: undefined }, alwaysSeen)).toBe(false);
  });

  // Une bulle que l'écran demande encore n'est pas close : elle est montrée comme d'habitude
  it("does not keep a bubble the screen still asks for", () => {
    expect(isLingering("first-draft", drafting, neverSeen)).toBe(false);
    expect(isLingering("empty-gauge", { ...resting, charges: 0 }, neverSeen)).toBe(false);
  });

  // Les autres partent à l'action qui les ferme : l'écran suivant prend le relais, ou l'action se voit
  it("lets the others go at once, whatever the screen shows", () => {
    const owner: HelpFacts = { ...drafting, role: "owner", charges: 0, canClaim: true, windowSection: "obs" };
    const lingering = HELP_BUBBLES.filter((bubble) => isLingering(bubble, owner, alwaysSeen));

    expect(lingering).toEqual(["empty-gauge", "first-draft", "keys", "eyedropper"]);
    expect(HELP_BUBBLES.filter((bubble) => !lingering.includes(bubble))).toEqual([
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
      "draft-trace",
      "draft-space",
      "palette",
    ]);
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : trois conseils du Dessin qui viennent avec les dessins posés sur l'appareil
describe("les conseils du Dessin après des dessins posés (Écart §8.1, JOURNAL 2026-10-12)", () => {
  const touching: HelpFacts = { ...drafting, hasColorButton: true, draftSize: 1 };
  const clicking: HelpFacts = { ...drafting, isTouchScreen: false, draftSize: 1 };
  const placed = (facts: HelpFacts, placementCount: number): HelpFacts => ({ ...facts, placementCount });

  // La palette : au doigt, sur la feuille repliée, dès le premier dessin posé
  it("wishes the palette on a touch screen with the folded sheet, from the first placement", () => {
    expect(wishedIn(placed(touching, 0))).toEqual([]);
    expect(wishedIn(placed(touching, 1))).toEqual(["palette"]);
    expect(wishedIn(placed(touching, PLACEMENT_COUNT_CAP))).toEqual(["palette", "eyedropper"]);
  });

  // Sans le bouton de la couleur (grand écran, panneau du paysage) ou à la souris, la palette n'a rien à désigner
  it("does not wish the palette without the color button, with a mouse, or out of Draft", () => {
    expect(wishedIn(placed({ ...touching, hasColorButton: false }, 1))).toEqual([]);
    expect(wishedIn(placed({ ...touching, isTouchScreen: false }, 1))).not.toContain("palette");
    expect(wishedIn(placed({ ...touching, pill: "view" }, 1))).toEqual([]);
    expect(wishedIn(placed({ ...touching, pill: undefined }, 1))).toEqual([]);
  });

  // Les touches : à la souris, dès le premier dessin posé, jamais au doigt
  it("wishes the keys with a mouse from the first placement, never on a touch screen", () => {
    expect(wishedIn(placed(clicking, 0))).toEqual([]);
    expect(wishedIn(placed(clicking, 1))).toEqual(["keys"]);
    expect(wishedIn(placed({ ...clicking, isTouchScreen: true }, 1))).not.toContain("keys");
    expect(wishedIn(placed({ ...clicking, pill: "view" }, 1))).toEqual([]);
  });

  // La pipette : au troisième dessin posé, des deux côtés, jamais avant ; le compteur plafonne là
  it("wishes the eyedropper from the third placement, on a mouse as on a touch screen", () => {
    expect(PLACEMENT_COUNT_CAP).toBe(3);
    expect(wishedIn(placed(clicking, 2))).toEqual(["keys"]);
    expect(wishedIn(placed(clicking, 3))).toEqual(["keys", "eyedropper"]);
    expect(wishedIn(placed(touching, 2))).toEqual(["palette"]);
    expect(wishedIn(placed({ ...clicking, pill: "view" }, 3))).toEqual([]);
  });

  // Les guides qui répondent à un geste ou au premier passage viennent d'abord ; les trois conseils suivent, une seule à la fois
  it("puts the gesture guides first, then the placement tips, one at a time", () => {
    const pickInOrder = (facts: HelpFacts): HelpBubble[] => {
      const seen = new Set<HelpBubble>();
      const picked: HelpBubble[] = [];
      for (let turn = 0; turn < 6; turn++) {
        const next = pickHelpBubble(facts, (bubble) => seen.has(bubble));
        if (!next) break;
        picked.push(next);
        seen.add(next);
      }
      return picked;
    };

    expect(pickInOrder({ ...placed(touching, 3), hasPannedInDraft: true, draftSize: 0 })).toEqual([
      "draft-trace",
      "first-draft",
      "palette",
      "eyedropper",
    ]);
    // Brouillon vide à la souris : le guide du premier passage, puis la pipette (qui ne dépend pas du brouillon) ; Ctrl+Z attend
    // le premier pixel et vient avant elle
    expect(pickInOrder({ ...placed(clicking, 3), draftSize: 0 })).toEqual(["first-draft", "eyedropper"]);
    expect(pickInOrder(placed(clicking, 3))).toEqual(["keys", "eyedropper"]);
  });

  // Ctrl+Z annule un trait : la bulle n'arrive qu'avec un brouillon non vide, dès son premier pixel, jamais devant un brouillon vide
  it("waits for the first pixel of the draft to wish the keys, and only then", () => {
    const empty = placed({ ...clicking, draftSize: 0 }, 1);
    const started = placed({ ...clicking, draftSize: 1 }, 1);

    expect(wishedIn(empty)).not.toContain("keys");
    expect(wishedIn(started)).toContain("keys");
    expect(wishedIn({ ...started, draftSize: 7 })).toContain("keys");
    // Le premier passage déjà vu, brouillon vide : aucune bulle ; au premier pixel, c'est elle
    expect(pickHelpBubble(empty, (bubble) => bubble === "first-draft")).toBeUndefined();
    expect(pickHelpBubble(started, (bubble) => bubble === "first-draft")).toBe("keys");
    // Le premier passage pas encore vu, brouillon vide : c'est lui, pas Ctrl+Z
    expect(pickHelpBubble(empty, neverSeen)).toBe("first-draft");
  });

  // Le brouillon qui se vide après le premier pixel (sans appui qui l'ait déjà fermée) : elle a servi, elle est vue, et reste 2 s
  it("counts the keys as done once the draft is empty again, and keeps them for the linger", () => {
    const started = placed({ ...clicking, draftSize: 1 }, 1);
    const emptied = { ...started, draftSize: 0 };

    expect(isDone("keys", started)).toBe(false);
    expect(isDone("keys", emptied)).toBe(true);
    expect(isLingering("keys", emptied, neverSeen)).toBe(true);
    expect(isLingering("keys", started, neverSeen)).toBe(false);
    expect(BUBBLE_LINGER_MS).toBe(2000);
  });

  // La palette s'efface en sortant du Dessin (la page la retient aussi quand on l'ouvre) ; elle ne reste pas après
  it("ends the palette when Draft is left, and does not stay after", () => {
    expect(isClosedBy("palette", "press")).toBe(false);
    expect(isDone("palette", placed({ ...touching, pill: "view" }, 1))).toBe(true);
    expect(isDone("palette", placed(touching, 1))).toBe(false);
    expect(isLingering("palette", placed({ ...touching, pill: "view" }, 1), () => true)).toBe(false);
    expect(isLingering("palette", placed(touching, 1), () => true)).toBe(false);
  });

  // Les touches et la pipette se ferment à l'action suivante et restent deux secondes en Dessin ; sortir du Dessin les emporte
  it("keeps the keys and the eyedropper in Draft after the next press, and ends them when Draft is left", () => {
    for (const bubble of ["keys", "eyedropper"] as const) {
      expect(isClosedBy(bubble, "press")).toBe(true);
      expect(isLingering(bubble, placed(clicking, 3), () => true)).toBe(true);
      expect(isLingering(bubble, placed(clicking, 3), neverSeen)).toBe(false);
      expect(isLingering(bubble, placed({ ...clicking, pill: "view" }, 3), () => true)).toBe(false);
      expect(isDone(bubble, placed({ ...clicking, pill: "view" }, 3))).toBe(true);
    }
  });
});

// Écart §8.1 (JOURNAL 2026-10-14) : à la souris, glisser en Dessin déplace la vue ; la bulle dit une fois de tenir Espace pour tracer
describe("la bulle d'Espace, à la souris (Écart §8.1, JOURNAL 2026-10-14)", () => {
  const moved: HelpFacts = { ...drafting, isTouchScreen: false, hasPannedInDraft: true, draftSize: 1 };
  const alwaysSeen = () => true;

  // Elle n'arrive qu'après un glissement de la souris en Dessin : ni avant, ni en Vue, ni au doigt
  it("wishes Space once the mouse moved the view in Draft, never before, in View or on a touch screen", () => {
    expect(wishedIn(moved)).toEqual(["draft-space"]);
    expect(wishedIn({ ...moved, hasPannedInDraft: false })).toEqual([]);
    expect(wishedIn({ ...moved, pill: "view" })).toEqual([]);
    expect(wishedIn({ ...moved, pill: undefined })).toEqual([]);
    expect(wishedIn({ ...moved, isTouchScreen: true })).toEqual(["draft-trace"]);
  });

  // Au doigt le glissement appelle le Tracé, à la souris Espace : jamais les deux pour la même personne
  it("answers a pan with the Trace on a touch screen and with Space with a mouse, never both", () => {
    for (const isTouchScreen of [true, false]) {
      const wished = wishedIn({ ...moved, isTouchScreen });
      expect(wished).toHaveLength(1);
      expect(wished).toEqual([isTouchScreen ? "draft-trace" : "draft-space"]);
    }
  });

  // Elle répond au geste qui vient d'avoir lieu : devant le premier passage et devant Ctrl+Z, qui l'attendent
  it("goes before the first Draft pass and before Ctrl+Z, one at a time", () => {
    const pickInOrder = (facts: HelpFacts): HelpBubble[] => {
      const seen = new Set<HelpBubble>();
      const picked: HelpBubble[] = [];
      for (let turn = 0; turn < 4; turn++) {
        const next = pickHelpBubble(facts, (bubble) => seen.has(bubble));
        if (!next) break;
        picked.push(next);
        seen.add(next);
      }
      return picked;
    };

    expect(pickInOrder({ ...moved, draftSize: 0 })).toEqual(["draft-space", "first-draft"]);
    expect(pickInOrder({ ...moved, placementCount: 1 })).toEqual(["draft-space", "keys"]);
  });

  // Une seule fois par appareil : vue, elle ne revient jamais, même si la souris glisse encore
  it("never comes back once seen", () => {
    expect(pickHelpBubble(moved, (bubble) => bubble === "draft-space")).toBeUndefined();
    expect(pickHelpBubble({ ...moved, draftSize: 0 }, (bubble) => bubble === "draft-space")).toBe(
      "first-draft",
    );
  });

  // L'action suivante (Espace tenu compris) la ferme, et elle part aussitôt : le tracé qui suit se voit, rien à relire
  it("is closed by the next press and goes at once, without staying", () => {
    expect(isClosedBy("draft-space", "press")).toBe(true);
    expect(isClosedBy("draft-space", "done")).toBe(false);
    expect(isLingering("draft-space", moved, alwaysSeen)).toBe(false);
    expect(isLingering("draft-space", moved, neverSeen)).toBe(false);
  });

  // Comme le Tracé, elle vit sur l'écran : ni dans la fenêtre ni dans l'inspection
  it("lives on the screen, not in a window or an inspection", () => {
    expect(surfaceOf("draft-space")).toBe("screen");
    expect(surfaceShown(moved)).toBe("screen");
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : qui modère trouve sa pill Modération, puis les actions de l'inspection
describe("les bulles de qui modère (Écart §8.1, JOURNAL 2026-10-12)", () => {
  const moderator: HelpFacts = { ...resting, role: "moderator" };
  const owner: HelpFacts = { ...resting, role: "owner" };
  // La pill Inspection montre une case posée par un autre compte, avec ses actions de modération.
  const inspecting = (facts: HelpFacts): HelpFacts => ({
    ...facts,
    isInspecting: true,
    canModerateInspected: true,
  });

  // L'accueil : qui modère sans être le streamer, en Vue seulement
  it("welcomes a moderator who is not the owner, in View only", () => {
    expect(wishedIn(moderator)).toEqual(["moderator-welcome"]);
    expect(wishedIn(owner)).toEqual(["obs-settings"]);
    expect(wishedIn({ ...resting, role: "viewer" })).toEqual([]);
    expect(wishedIn({ ...resting, role: undefined })).toEqual([]);
    expect(wishedIn({ ...moderator, pill: "draft" })).toEqual(["first-draft"]);
    expect(wishedIn({ ...moderator, pill: undefined })).toEqual([]);
  });

  // Elle attend son geste : elle ne se clôt ni à l'action suivante, ni à la fin de sa condition ; ouvrir Modération la fait trouver
  it("waits for its gesture: only opening Moderation ends it, never a press or the end of its condition", () => {
    expect(isClosedBy("moderator-welcome", "press")).toBe(false);
    expect(isClosedBy("moderator-welcome", "done")).toBe(false);
    expect(isDone("moderator-welcome", { ...moderator, pill: "draft" })).toBe(false);
    expect(bubblesFoundIn("moderation")).toContain("moderator-welcome");
    expect(bubblesFoundIn("canvas")).not.toContain("moderator-welcome");
    expect(bubblesFoundIn("account")).not.toContain("moderator-welcome");
  });

  // Un signalement en attente passe avant l'accueil ; ouvrir Modération les fait trouver tous les deux
  it("lets a pending report go first, and opening Moderation finds both", () => {
    const reported: HelpFacts = { ...moderator, pendingReports: 2 };
    const seen = new Set<HelpBubble>();

    expect(pickHelpBubble(reported, (bubble) => seen.has(bubble))).toBe("pending-report");
    for (const bubble of bubblesFoundIn("moderation")) seen.add(bubble);
    expect(pickHelpBubble(reported, (bubble) => seen.has(bubble))).toBeUndefined();
  });

  // Les actions : seulement quand la pill montre la pose d'un autre compte avec ses actions, au streamer comme au modérateur
  it("wishes the moderation actions when the inspection shows them, to the owner as to a moderator", () => {
    for (const facts of [moderator, owner]) {
      expect(wishedIn(inspecting(facts))).toContain("moderation-actions");
      expect(wishedIn({ ...facts, isInspecting: true })).not.toContain("moderation-actions");
      expect(wishedIn(facts)).not.toContain("moderation-actions");
    }
    expect(wishedIn({ ...resting, role: "viewer", isInspecting: true })).toEqual([]);
  });

  // L'inspection est la seule surface où une bulle se montre : celle de l'écran se taisent, comme avant
  it("shows only the moderation actions during an inspection, and keeps every screen bubble quiet", () => {
    const busy: HelpFacts = { ...owner, pendingReports: 2, canClaim: true, charges: 0 };

    expect(pickHelpBubble(busy, neverSeen)).toBe("pending-report");
    expect(pickHelpBubble({ ...busy, isInspecting: true }, neverSeen)).toBeUndefined();
    expect(pickHelpBubble(inspecting(busy), neverSeen)).toBe("moderation-actions");
    expect(pickHelpBubble(inspecting(busy), (bubble) => bubble === "moderation-actions")).toBeUndefined();
  });

  // Seule la première inspection la montre : vue, elle ne revient plus
  it("never comes back once seen", () => {
    expect(
      pickHelpBubble(inspecting(moderator), (bubble) => bubble === "moderation-actions"),
    ).toBeUndefined();
  });

  // La fenêtre passe avant l'inspection : une fenêtre ouverte par-dessus ne laisse que ses propres bulles
  it("lets the window go first when it is open over an inspection", () => {
    const over: HelpFacts = { ...inspecting(owner), windowSection: "account" };

    expect(surfaceShown(over)).toBe("window");
    expect(pickHelpBubble(over, neverSeen)).toBe("obs-tab");
    expect(pickHelpBubble({ ...over, role: "moderator" }, neverSeen)).toBeUndefined();
  });

  // Chaque bulle vit sur une surface : cinq dans la fenêtre, celle des actions dans l'inspection, les autres sur l'écran
  it("puts each bubble on its own surface: five in the window, the actions in the inspection, the rest on the screen", () => {
    expect(HELP_BUBBLES.filter((bubble) => surfaceOf(bubble) === "window")).toEqual([
      "obs-tab",
      "obs-address",
      "invite-link",
      "theme",
      "twitch-sync",
    ]);
    expect(HELP_BUBBLES.filter((bubble) => surfaceOf(bubble) === "inspection")).toEqual([
      "moderation-actions",
    ]);
    expect(HELP_BUBBLES.filter((bubble) => surfaceOf(bubble) === "screen")).toHaveLength(
      HELP_BUBBLES.length - 6,
    );
    expect(surfaceShown(resting)).toBe("screen");
    expect(surfaceShown({ ...resting, isInspecting: true })).toBe("inspection");
  });

  // Elle part à l'action suivante, ou dès que l'inspection se ferme (ou passe à une pose qu'on ne modère pas), et ne reste pas
  it("goes at the next press or when the inspection closes, and does not stay", () => {
    expect(isClosedBy("moderation-actions", "press")).toBe(true);
    expect(isDone("moderation-actions", inspecting(moderator))).toBe(false);
    expect(
      isDone("moderation-actions", {
        ...inspecting(moderator),
        isInspecting: false,
        canModerateInspected: false,
      }),
    ).toBe(true);
    expect(isDone("moderation-actions", { ...inspecting(moderator), canModerateInspected: false })).toBe(
      true,
    );
    expect(isLingering("moderation-actions", moderator, () => true)).toBe(false);
    expect(isLingering("moderation-actions", inspecting(moderator), () => true)).toBe(false);
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : la chaîne du streamer continue après l'adresse, dans la fenêtre
describe("la suite de la chaîne du streamer : le lien, le thème, la synchro Twitch (Écart §8.1, JOURNAL 2026-10-12)", () => {
  const owner: HelpFacts = { ...resting, role: "owner" };
  // Ce que la fenêtre voudrait : les bulles de l'écran voudraient aussi (Réglages), mais ne se montrent pas pendant qu'elle est ouverte.
  const windowWished = (facts: HelpFacts): HelpBubble[] => wishedIn(facts).filter(isInWindow);
  const inWindow = (windowSection: string, facts: HelpFacts = owner): HelpFacts => ({
    ...facts,
    windowSection,
  });
  const themeless = (windowSection: string): HelpFacts => ({
    ...inWindow(windowSection),
    isThemeMissing: true,
  });
  const unsynced = (windowSection: string): HelpFacts => ({
    ...inWindow(windowSection),
    isTwitchSyncMissing: true,
  });
  const everything = (windowSection: string): HelpFacts => ({
    ...inWindow(windowSection),
    isThemeMissing: true,
    isTwitchSyncMissing: true,
  });

  // Le lien à partager : dans Vue OBS, pour le streamer seul, et après l'adresse, qu'il suit dans l'ordre de la chaîne
  it("wishes the link to share in Vue OBS for the owner alone, after the address", () => {
    expect(windowWished(inWindow("obs"))).toEqual(["obs-address", "invite-link"]);
    for (const section of ["canvas", "canvases", "moderation", "account"])
      expect(windowWished(inWindow(section))).not.toContain("invite-link");
    expect(windowWished(inWindow("obs", { ...resting, role: "moderator" }))).not.toContain("invite-link");
    expect(windowWished(owner)).not.toContain("invite-link");
    expect(pickHelpBubble(inWindow("obs"), neverSeen)).toBe("obs-address");
    expect(pickHelpBubble(inWindow("obs"), (bubble) => bubble === "obs-address")).toBe("invite-link");
  });

  // Le lien se clôt en quittant la section ou en fermant la fenêtre ; il ne reste pas
  it("ends the link when the window leaves Vue OBS or closes, and does not stay", () => {
    expect(isClosedBy("invite-link", "done")).toBe(true);
    expect(isClosedBy("invite-link", "press")).toBe(false);
    expect(isDone("invite-link", inWindow("canvas"))).toBe(true);
    expect(isDone("invite-link", owner)).toBe(true);
    expect(isDone("invite-link", inWindow("obs"))).toBe(false);
    expect(isLingering("invite-link", inWindow("canvas"), () => true)).toBe(false);
  });

  // Le thème : dans la section Fresque, tant que la fresque n'en a pas, pour le streamer seul
  it("wishes the theme for the owner in the Canvas section while the canvas has none", () => {
    expect(windowWished(themeless("canvas"))).toEqual(["obs-tab", "theme"]);
    expect(windowWished(inWindow("canvas"))).not.toContain("theme");
    for (const section of ["obs", "canvases", "moderation", "account"])
      expect(windowWished(themeless(section))).not.toContain("theme");
    expect(windowWished({ ...themeless("canvas"), role: "moderator" })).not.toContain("theme");
    expect(windowWished({ ...resting, role: "owner", isThemeMissing: true })).not.toContain("theme");
  });

  // Un thème enregistré, ou la section quittée : la bulle a servi, elle est retenue comme vue
  it("ends the theme once a theme is saved or the section is left", () => {
    expect(isDone("theme", inWindow("canvas"))).toBe(true);
    expect(isDone("theme", themeless("canvas"))).toBe(false);
    expect(isDone("theme", themeless("obs"))).toBe(true);
    expect(isDone("theme", { ...resting, role: "owner", isThemeMissing: true })).toBe(true);
  });

  // La synchro Twitch : la fenêtre ouverte ailleurs que sur Modération, jamais faite, pour le streamer seul
  it("wishes the Twitch sync for the owner while the window is open anywhere but Moderation, never done", () => {
    for (const section of ["canvas", "canvases", "obs", "account"])
      expect(windowWished(unsynced(section))).toContain("twitch-sync");
    expect(windowWished(unsynced("moderation"))).not.toContain("twitch-sync");
    expect(windowWished(inWindow("canvas"))).not.toContain("twitch-sync");
    expect(windowWished({ ...unsynced("canvas"), role: "moderator" })).not.toContain("twitch-sync");
    expect(windowWished({ ...resting, role: "owner", isTwitchSyncMissing: true })).not.toContain(
      "twitch-sync",
    );
  });

  // Ouvrir Modération la clôt : elle est trouvée, et elle est retenue vue même sans avoir été montrée
  it("is found by opening Moderation, which ends it", () => {
    expect(bubblesFoundIn("moderation")).toContain("twitch-sync");
    expect(isDone("twitch-sync", unsynced("moderation"))).toBe(true);
    expect(isDone("twitch-sync", unsynced("canvas"))).toBe(false);
    expect(isDone("twitch-sync", owner)).toBe(true);
  });

  // Dans l'ordre de la chaîne, une seule à la fois : l'onglet, l'adresse, le lien, le thème, la synchro
  it("walks the whole chain in its order, one bubble at a time", () => {
    const seen = new Set<HelpBubble>();
    const pick = (facts: HelpFacts): HelpBubble | undefined =>
      pickHelpBubble(facts, (bubble) => seen.has(bubble));
    const walk = (facts: HelpFacts): HelpBubble[] => {
      const picked: HelpBubble[] = [];
      for (let turn = 0; turn < 6; turn++) {
        const next = pick(facts);
        if (!next) break;
        picked.push(next);
        seen.add(next);
      }
      return picked;
    };

    expect(walk(everything("canvas"))).toEqual(["obs-tab", "theme", "twitch-sync"]);
    expect(walk(everything("obs"))).toEqual(["obs-address", "invite-link"]);
    expect(walk(everything("account"))).toEqual([]);
  });

  // Le thème et la synchro passent après la chaîne OBS : tant que l'onglet n'est pas vu, il passe devant
  it("keeps the tab before the theme and the Twitch sync until it is seen", () => {
    expect(pickHelpBubble(everything("canvas"), neverSeen)).toBe("obs-tab");
    expect(pickHelpBubble(everything("canvas"), (bubble) => bubble === "obs-tab")).toBe("theme");
    expect(pickHelpBubble(everything("account"), neverSeen)).toBe("obs-tab");
    expect(pickHelpBubble(everything("account"), (bubble) => bubble === "obs-tab")).toBe("twitch-sync");
  });

  // Une bulle de la fenêtre ne revient pas une fois vue, où que le streamer soit
  it("never comes back once seen", () => {
    expect(pickHelpBubble(themeless("canvas"), (bubble) => bubble !== "theme")).toBe("theme");
    expect(pickHelpBubble(themeless("canvas"), () => true)).toBeUndefined();
    expect(pickHelpBubble(unsynced("account"), (bubble) => bubble !== "twitch-sync")).toBe("twitch-sync");
    expect(pickHelpBubble(unsynced("account"), () => true)).toBeUndefined();
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : la synchro Twitch jamais faite se lit dans la réponse de la liste des modérateurs
describe("lire la synchro Twitch jamais faite (Écart §8.1, JOURNAL 2026-10-12)", () => {
  // Une liste qui ne porte aucune synchro : jamais faite
  it("is never done when the list of moderators carries no sync", () => {
    expect(isTwitchSyncNever({ ok: true, value: { users: [] } })).toBe(true);
  });

  // Une synchro faite, ou révoquée depuis : elle a eu lieu, il n'y a rien à proposer
  it("is done when the list carries a sync, whether it is still granted or revoked", () => {
    expect(
      isTwitchSyncNever({ ok: true, value: { users: [], twitchSync: { status: "ok", syncedAt: 1 } } }),
    ).toBe(false);
    expect(
      isTwitchSyncNever({ ok: true, value: { users: [], twitchSync: { status: "revoked", syncedAt: 1 } } }),
    ).toBe(false);
  });

  // Un échec (connexion coupée, refus) ne dit rien : pas de bulle
  it("says nothing when the answer failed", () => {
    expect(isTwitchSyncNever({ ok: false, error: "closed" })).toBe(false);
    expect(isTwitchSyncNever({ ok: false, error: "forbidden" })).toBe(false);
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : un seul bouton dans Vue OBS, qui porte la bulle de l'adresse puis celle du partage
describe("copier le bouton de Vue OBS (Écart §8.1, JOURNAL 2026-10-12)", () => {
  // Rien n'est vu : la première copie finit la chaîne OBS, pas encore le partage, qui n'a pas eu son tour
  it("ends the OBS chain on the first copy, not yet the link to share", () => {
    expect(bubblesEndedByCopy(neverSeen)).toEqual(OBS_CHAIN);
    expect(bubblesEndedByCopy(neverSeen)).not.toContain("invite-link");
  });

  // L'adresse vue, la bulle du partage a pris la place sur le même bouton : la copie suivante la finit aussi
  it("ends the link to share on the next copy, once the address is seen", () => {
    const seen = new Set<HelpBubble>(OBS_CHAIN);

    expect(bubblesEndedByCopy((bubble) => seen.has(bubble))).toEqual([...OBS_CHAIN, "invite-link"]);
  });

  // Dans l'ordre : l'adresse, une copie, le partage, une copie, plus rien
  it("walks the address bubble, a copy, the share bubble, a copy, then nothing", () => {
    const seen = new Set<HelpBubble>(["obs-settings", "obs-tab"]);
    const inObs: HelpFacts = { ...resting, role: "owner", windowSection: "obs" };
    const pick = (): HelpBubble | undefined => pickHelpBubble(inObs, (bubble) => seen.has(bubble));
    const copy = (): void => {
      for (const bubble of bubblesEndedByCopy((other) => seen.has(other))) seen.add(bubble);
    };

    expect(pick()).toBe("obs-address");
    copy();
    expect(pick()).toBe("invite-link");
    copy();
    expect(pick()).toBeUndefined();
  });
});

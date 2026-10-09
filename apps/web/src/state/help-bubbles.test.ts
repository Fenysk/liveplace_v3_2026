import { describe, expect, it } from "vitest";
import {
  bubblesFoundIn,
  HELP_BUBBLES,
  type HelpBubble,
  type HelpFacts,
  isClosedBy,
  isDone,
  isInWindow,
  isWished,
  OBS_CHAIN,
  pickHelpBubble,
} from "./help-bubbles";

// Un viewer tactile qui regarde, sans rien à signaler : aucune bulle n'est demandée.
const resting: HelpFacts = {
  role: "viewer",
  pill: "view",
  isTouchScreen: true,
  isTouchTracing: false,
  hasPannedInDraft: false,
  draftSize: 0,
  charges: 5,
  canClaim: false,
  pendingReports: 0,
  windowSection: undefined,
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
    expect(wishedIn({ ...resting, role: "moderator", pendingReports: 1 })).toEqual(["pending-report"]);
    expect(wishedIn({ ...resting, role: "owner", pendingReports: 3 })).toContain("pending-report");
    expect(wishedIn({ ...resting, role: "moderator", pendingReports: 0 })).toEqual([]);
    expect(wishedIn({ ...drafting, role: "moderator", pendingReports: 1 })).toEqual(["first-draft"]);
    expect(wishedIn({ ...resting, role: "viewer", pendingReports: 1 })).toEqual([]);
  });

  // Le streamer sur son canvas, en Vue : OBS se branche dans Réglages
  it("wishes the OBS bubble for the owner on his canvas, in View only", () => {
    expect(wishedIn({ ...resting, role: "owner" })).toEqual(["obs-settings"]);
    expect(wishedIn({ ...resting, role: "moderator" })).toEqual([]);
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
    expect(wishedIn({ ...panned, isTouchScreen: false })).toEqual([]);
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

  // Ce qui clôt une bulle montrée : l'action suivante pour trois d'entre elles, la fin de leur condition pour cinq autres
  it("closes the bubbles that ask for no precise gesture on the next press or when they are done", () => {
    const closedBy = (closing: "press" | "done") => HELP_BUBBLES.filter((b) => isClosedBy(b, closing));
    expect(closedBy("press")).toEqual(["first-reward", "empty-gauge", "draft-trace"]);
    expect(closedBy("done")).toEqual([
      "obs-tab",
      "obs-address",
      "first-reward",
      "empty-gauge",
      "first-draft",
    ]);
  });

  // Ouvrir la fenêtre sur la bonne section fait trouver la bulle : Modération pour les signalements, Canvas ou Vue OBS pour OBS
  it("finds the bubbles through the window section that answers them", () => {
    expect(bubblesFoundIn("moderation")).toEqual(["pending-report"]);
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

  // Les deux dernières vivent dans la fenêtre ; les autres, sur l'écran
  it("lives in the window for the tab and the address, on the screen for the others", () => {
    expect(HELP_BUBBLES.filter(isInWindow)).toEqual(["obs-tab", "obs-address"]);
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
    expect(pickHelpBubble(inWindow("obs", busy), (bubble) => bubble === "obs-address")).toBeUndefined();
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
    expect(pick(inWindow("obs"))).toBeUndefined();
    expect(pick(inWindow("canvas"))).toBeUndefined();
  });

  // Un streamer qui va directement sur Vue OBS saute l'onglet : ouvrir la section le fait trouver, même sans l'avoir vu
  it("skips the tab for an owner who goes straight to Vue OBS", () => {
    const seen = new Set<HelpBubble>(bubblesFoundIn("obs"));

    expect(pickHelpBubble(inWindow("obs"), (bubble) => seen.has(bubble))).toBe("obs-address");
    expect(pickHelpBubble(inWindow("canvas"), (bubble) => seen.has(bubble))).toBeUndefined();
  });

  // Celui qui a copié l'adresse ne voit plus rien de la chaîne, où qu'il soit
  it("shows nothing of the chain once the address is copied", () => {
    const seen = new Set<HelpBubble>(OBS_CHAIN);

    expect(OBS_CHAIN).toEqual(["obs-settings", "obs-tab", "obs-address"]);
    for (const facts of [owner, inWindow("canvas"), inWindow("obs"), inWindow("account")])
      expect(pickHelpBubble(facts, (bubble) => seen.has(bubble))).toBeUndefined();
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

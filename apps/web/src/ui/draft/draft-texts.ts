// Les phrases de la pill Dessin (§9.9) : ses boutons, ses états, et ce que la jauge dit.

import type { CanvasView } from "../../state/canvas-store";
import { defineTexts, localized } from "../locale/texts";

// Le code d'erreur que le gateway a envoyé, tel que le store le garde.
export type RefusalCode = NonNullable<CanvasView["lastError"]>;

// Les phrases de la langue de la page, telles que `useTexts` les rend.
export type DraftTexts = (typeof DRAFT_TEXTS)["fr"];

type GaugeSentence = {
  charges: number;
  max: number;
  afterPlacement?: number | undefined; // ce qu'il resterait en posant le brouillon
  nextRefill?: { charges: number; countdown: string } | undefined; // absent : jauge pleine
  claimable: number;
  reserve?: number | undefined; // les pixels de réserve (mode événement), dépensés avant les charges
};

export const DRAFT_TEXTS = defineTexts({
  draw: { fr: "Dessiner", en: "Draw" },
  drawTip: { fr: "Passer en mode Dessin", en: "Switch to Draw mode" },
  closeTip: {
    fr: "Fermer le mode Dessin : le brouillon est gardé",
    en: "Close Draw mode: your draft is kept",
  },
  confirm: { fr: "Valider", en: "Confirm" },
  confirmTip: { fr: "Poser le brouillon", en: "Place the draft" },
  // Plus aucun pixel et rien à poser : le bouton compte jusqu'au prochain (§9.6).
  waitLead: { fr: "Attendre ", en: "Wait " },
  waitTip: { fr: "Attendre le prochain pixel", en: "Wait for the next pixel" },
  clearDraftTip: { fr: "Vider le brouillon", en: "Clear the draft" },
  // Le toast de Vider : le brouillon revient d'un bouton, tant que rien n'a été dessiné depuis (§9.6).
  draftCleared: { fr: "Brouillon vidé", en: "Draft cleared" },
  restoreDraft: { fr: "Rétablir", en: "Restore" },
  traceTip: {
    fr: "Tracé : un doigt dessine, deux doigts déplacent",
    en: "Trace: one finger draws, two fingers move",
  },
  eyedropperTip: {
    fr: "Pipette (I) : prend la couleur d'un pixel posé",
    en: "Eyedropper (I): picks the color of a placed pixel",
  },
  undoTip: {
    fr: "Annuler (Ctrl+Z) : défait ton dernier trait",
    en: "Undo (Ctrl+Z): takes back your last stroke",
  },
  redoTip: {
    fr: "Rétablir (Ctrl+Maj+Z) : refait ce qui vient d'être annulé",
    en: "Redo (Ctrl+Shift+Z): brings back what was undone",
  },
  collapseSheet: { fr: "Réduire la feuille", en: "Collapse the sheet" },
  expandPalette: { fr: "Déplier la palette", en: "Expand the palette" },

  // Les états de la pill : la connexion, la coupure, le ban, l'invitation.
  connecting: { fr: "Connexion", en: "Connecting" },
  reconnecting: { fr: "Reconnexion", en: "Reconnecting" },
  connectingToTwitch: { fr: "Connexion à Twitch", en: "Connecting to Twitch" },
  connectionLost: { fr: "Connexion perdue", en: "Connection lost" },
  reload: { fr: "Recharger", en: "Reload" },
  banned: { fr: "Tu es banni·e de cette fresque", en: "You're banned from this canvas" },
  // JOURNAL 2026-11-12 : une fresque réservée au live du streamer, hors de son live : le toast de Dessiner grisé.
  waitingForLive: localized({
    fr: (name: string) => `Le dessin s'ouvre quand ${name} est en live`,
    en: (name) => `Drawing opens when ${name} is live`,
  }),
  // JOURNAL 2026-11-21 : le dessin fermé par l'événement, avant son début puis après sa fin.
  waitingForEvent: {
    fr: "Le dessin ouvre au début de l'événement.",
    en: "Drawing opens when the event starts.",
  },
  eventOver: {
    fr: "L'événement est fini : le dessin est fermé.",
    en: "The event is over: drawing is closed.",
  },
  signInToDraw: { fr: "Se connecter pour dessiner", en: "Sign in to draw" },

  // Un refus du gateway : il envoie un code (`ErrorCodeSchema`), jamais une phrase.
  // Un `switch` exhaustif : le compilateur signale tout code laissé sans phrase.
  refusal: localized({
    fr: (code: RefusalCode) => {
      if (code === "charity_event_unavailable") return "Le mode événement n'est pas disponible ici.";
      switch (code) {
        case "protocol_version":
          return "LivePlace a été mis à jour : recharge la page.";
        case "unauthenticated":
          return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
        case "forbidden":
          return "Tu ne peux pas faire ça ici.";
        case "rate_limited":
          return "Trop vite : réessaie dans un instant.";
        case "invalid_frame":
          return "Cette demande n'a pas été comprise : recharge la page.";
        case "canvas_not_found":
          return "Cette fresque n'existe pas.";
        case "canvas_recovering":
          return "On remet chaque pixel à sa place : réessaie dans un instant.";
        case "canvas_archived":
          return "Cette fresque est archivée : on n'y pose plus.";
        case "server_full":
          return "Le serveur est plein : réessaie dans un instant.";
      }
    },
    en: (code) => {
      if (code === "charity_event_unavailable") return "Event mode isn't available here.";
      switch (code) {
        case "protocol_version":
          return "LivePlace was updated: reload the page.";
        case "unauthenticated":
          return "Your session expired. Sign in again, then try again.";
        case "forbidden":
          return "You can't do that here.";
        case "rate_limited":
          return "Too fast: try again in a moment.";
        case "invalid_frame":
          return "That request wasn't understood: reload the page.";
        case "canvas_not_found":
          return "This canvas doesn't exist.";
        case "canvas_recovering":
          return "We're putting every pixel back in place: try again in a moment.";
        case "canvas_archived":
          return "This canvas is archived: nothing can be placed on it.";
        case "server_full":
          return "The server is full: try again in a moment.";
      }
    },
  }),

  // Le client prédit, le serveur tranche : l'infobulle de la jauge, dite d'un trait (§9.4).
  // JOURNAL 2026-09-30 : « 1 récompense à réclamer », au pluriel au-delà. §9.4 : en pixels, durées en « 12 s ».
  gaugeLabel: localized({
    fr: ({ charges, max, afterPlacement, nextRefill, claimable, reserve = 0 }: GaugeSentence) => {
      const inReserve = reserve > 0 ? `, plus ${reserve.toLocaleString("fr")} en réserve` : "";
      const after = afterPlacement?.toLocaleString("fr");
      const placed = after === undefined ? "" : `, ${after} ${reserve > 0 ? "en tout " : ""}après ce dessin`;
      const refill = nextRefill
        ? `, +${nextRefill.charges} pixel${nextRefill.charges > 1 ? "s" : ""} dans ${nextRefill.countdown}`
        : ", jauge pleine";
      const rewards =
        claimable === 0 ? "" : `, ${claimable} récompense${claimable > 1 ? "s" : ""} à réclamer`;
      return `${charges} / ${max} pixels${inReserve}${placed}${refill}${rewards}`;
    },
    en: ({ charges, max, afterPlacement, nextRefill, claimable, reserve = 0 }) => {
      const inReserve = reserve > 0 ? `, plus ${reserve.toLocaleString("en")} in reserve` : "";
      const after = afterPlacement?.toLocaleString("en");
      const placed =
        after === undefined ? "" : `, ${after} ${reserve > 0 ? "in all " : ""}after this drawing`;
      const refill = nextRefill
        ? `, +${nextRefill.charges} pixel${nextRefill.charges > 1 ? "s" : ""} in ${nextRefill.countdown}`
        : ", gauge full";
      const rewards = claimable === 0 ? "" : `, ${claimable} reward${claimable > 1 ? "s" : ""} to claim`;
      return `${charges} / ${max} pixels${inReserve}${placed}${refill}${rewards}`;
    },
  }),
});

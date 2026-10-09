// Les phrases de la pill Dessin (Écart §14, JOURNAL 2026-10-07) : ses boutons, ses états, et ce que la jauge dit.

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
};

export const DRAFT_TEXTS = defineTexts({
  draw: { fr: "Dessiner", en: "Draw" },
  drawTip: { fr: "Passer en mode Dessin", en: "Switch to Draw mode" },
  cancelTip: {
    fr: "Sortir du mode Dessin (le brouillon est gardé)",
    en: "Leave Draw mode (your draft is kept)",
  },
  confirm: { fr: "Valider", en: "Confirm" },
  confirmTip: { fr: "Poser le brouillon", en: "Place the draft" },
  // Plus aucune charge et rien à poser : le bouton compte jusqu'à la prochaine (Écart §9.3, JOURNAL 2026-10-08).
  waitLead: { fr: "Attendre ", en: "Wait " },
  waitTip: { fr: "Attendre la prochaine charge", en: "Wait for the next charge" },
  clearDraftTip: { fr: "Vider le brouillon", en: "Clear the draft" },
  traceTip: {
    fr: "Tracé : un doigt dessine, deux doigts déplacent",
    en: "Trace: one finger draws, two fingers move",
  },
  eyedropperTip: {
    fr: "Pipette (I) : prend la couleur d'un pixel posé",
    en: "Eyedropper (I): picks the color of a placed pixel",
  },
  collapseSheet: { fr: "Réduire la feuille", en: "Collapse the sheet" },
  expandPalette: { fr: "Déplier la palette", en: "Expand the palette" },

  // Les états de la pill : la connexion, la coupure, le ban, l'invitation.
  connecting: { fr: "Connexion", en: "Connecting" },
  reconnecting: { fr: "Reconnexion", en: "Reconnecting" },
  connectingToTwitch: { fr: "Connexion à Twitch", en: "Connecting to Twitch" },
  connectionLost: { fr: "Connexion perdue", en: "Connection lost" },
  reload: { fr: "Recharger", en: "Reload" },
  banned: { fr: "Tu es banni·e de ce canvas", en: "You're banned from this canvas" },
  signInToDraw: { fr: "Se connecter pour dessiner", en: "Sign in to draw" },

  // Un refus du gateway : il envoie un code (`ErrorCodeSchema`), jamais une phrase.
  // Un `switch` exhaustif : le compilateur signale tout code laissé sans phrase.
  refusal: localized({
    fr: (code: RefusalCode) => {
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
          return "Ce canvas n'existe pas.";
        case "canvas_recovering":
          return "On remet chaque pixel à sa place : réessaie dans un instant.";
        case "canvas_archived":
          return "Ce canvas est archivé : on n'y pose plus.";
        case "server_full":
          return "Le serveur est plein : réessaie dans un instant.";
      }
    },
    en: (code) => {
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
  // JOURNAL 2026-09-30 : « 1 récompense à réclamer », au pluriel au-delà.
  gaugeLabel: localized({
    fr: ({ charges, max, afterPlacement, nextRefill, claimable }: GaugeSentence) => {
      const placed = afterPlacement === undefined ? "" : `${afterPlacement} après la pose, `;
      const refill = nextRefill ? `, +${nextRefill.charges} dans ${nextRefill.countdown}` : ", jauge pleine";
      const rewards =
        claimable === 0 ? "" : `, ${claimable} récompense${claimable > 1 ? "s" : ""} à réclamer`;
      return `${placed}${charges} / ${max} charges${refill}${rewards}`;
    },
    en: ({ charges, max, afterPlacement, nextRefill, claimable }) => {
      const placed = afterPlacement === undefined ? "" : `${afterPlacement} after placing, `;
      const refill = nextRefill ? `, +${nextRefill.charges} in ${nextRefill.countdown}` : ", gauge full";
      const rewards = claimable === 0 ? "" : `, ${claimable} reward${claimable > 1 ? "s" : ""} to claim`;
      return `${placed}${charges} / ${max} charges${refill}${rewards}`;
    },
  }),
});

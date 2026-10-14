// Le vocabulaire de l'interface (Écart §14, JOURNAL 2026-10-13) : jamais « pose », « joueur », « utilisateur » ni « charge » à
// l'écran, jamais « ± ». En anglais, « drawing » et « viewer », jamais « placement » ni « player ».
// `draft-texts.ts` manque : son refus « on n'y pose plus » (fresque archivée) attend sa reformulation.

import { describe, expect, it } from "vitest";
import { ACCOUNT_TEXTS } from "../account/account-texts";
import { ARCHIVE_TEXTS } from "../archive/archive-texts";
import { CANVAS_TEXTS } from "../canvas/canvas-texts";
import { DESIGN_TEXTS } from "../design/design-texts";
import { HELP_TEXTS } from "../help/help-texts";
import { HINT_TEXTS } from "../hint/hint-texts";
import { INSPECTION_TEXTS } from "../inspection/inspection-texts";
import { LINK_PREVIEW_TEXTS } from "../link-preview/link-preview-texts";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import { OBS_TEXTS } from "../obs/obs-texts";
import { SCOREBOARD_TEXTS } from "../scoreboard/scoreboard-texts";

const MODULES = {
  account: ACCOUNT_TEXTS,
  archive: ARCHIVE_TEXTS,
  canvas: CANVAS_TEXTS,
  design: DESIGN_TEXTS,
  help: HELP_TEXTS,
  hint: HINT_TEXTS,
  inspection: INSPECTION_TEXTS,
  linkPreview: LINK_PREVIEW_TEXTS,
  moderation: MODERATION_TEXTS,
  obs: OBS_TEXTS,
  scoreboard: SCOREBOARD_TEXTS,
};

const BANNED = {
  fr: /\b(?:poses?|joueurs?|utilisateurs?|charges?)\b|±/i,
  en: /\b(?:placements?|players?|users?)\b|±/i,
};

// Le texte de chaque phrase, fonctions comprises : le source d'une fonction contient ses gabarits.
const textOf = (value: unknown): string =>
  JSON.stringify(value, (_key, part: unknown) => (typeof part === "function" ? part.toString() : part));

describe("the words of the interface (Écart §14, JOURNAL 2026-10-13)", () => {
  for (const locale of ["fr", "en"] as const) {
    // Aucun mot écarté dans les phrases des modules qui parlent de dessins, de viewers et de pixels
    it(`has no banned word in the ${locale} sentences of the game`, () => {
      for (const [name, texts] of Object.entries(MODULES))
        for (const [key, value] of Object.entries(texts[locale]))
          expect(textOf(value), `${name}.${key}`).not.toMatch(BANNED[locale]);
    });
  }
});

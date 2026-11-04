// Les pastilles d'une phrase (JOURNAL 2026-11-04) : chaque élément d'interface qu'un document cite porte le nom d'un identifiant dans ses
// textes. Son nom vient des textes de son bouton, jamais recopié ; son icône et sa couleur sont celles du bouton, s'il en a.

import { Flag, Trash2, User } from "lucide-react";
import { ACCOUNT_TEXTS } from "../account/account-texts";
import { DELETE_ACCOUNT_TEXTS } from "../account/delete-account-texts";
import type { ButtonIcon } from "../design/button";
import type { ChipTone } from "../design/chip";
import { TwitchGlyph } from "../design/twitch";
import { INSPECTION_TEXTS } from "../inspection/inspection-texts";
import type { Locale } from "../locale/locale";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import { SCOREBOARD_TEXTS } from "../scoreboard/scoreboard-texts";
import type { ChipName } from "./document-sections";

// Une pastille rendue : son nom dans la langue de la page, et l'icône et la couleur de son bouton
export type SentenceChip = { label: string; icon?: ButtonIcon; tone?: ChipTone };

export const sentenceChips = (locale: Locale): Record<ChipName, SentenceChip> => ({
  myAccount: { label: ACCOUNT_TEXTS[locale].myAccount, icon: User },
  deleteAccount: { label: DELETE_ACCOUNT_TEXTS[locale].deleteAccount, icon: Trash2, tone: "danger" },
  report: { label: INSPECTION_TEXTS[locale].report, icon: Flag },
  syncWithTwitch: { label: MODERATION_TEXTS[locale].syncWithTwitch, icon: TwitchGlyph, tone: "twitch" },
  inspection: { label: INSPECTION_TEXTS[locale].title },
  scoreboard: { label: SCOREBOARD_TEXTS[locale].label },
});

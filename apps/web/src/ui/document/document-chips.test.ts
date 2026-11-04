import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Flag, Trash2, User } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ACCOUNT_TEXTS } from "../account/account-texts";
import { DELETE_ACCOUNT_TEXTS } from "../account/delete-account-texts";
import { TwitchGlyph } from "../design/twitch";
import { INSPECTION_TEXTS } from "../inspection/inspection-texts";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import { SCOREBOARD_TEXTS } from "../scoreboard/scoreboard-texts";
import { sentenceChips } from "./document-chips";
import type { ChipName } from "./document-sections";

const LOCALES = ["fr", "en"] as const;
const NAMES: readonly ChipName[] = [
  "myAccount",
  "deleteAccount",
  "report",
  "syncWithTwitch",
  "inspection",
  "scoreboard",
];

const source = (file: string): string => readFileSync(join(import.meta.dirname, "..", file), "utf8");

describe("les pastilles d'une phrase (JOURNAL 2026-11-04)", () => {
  // Le nom est celui du bouton, mot pour mot, tiré de ses textes : il ne peut pas diverger
  it("takes each name from the texts of the real button, in the language of the page", () => {
    for (const locale of LOCALES) {
      const chips = sentenceChips(locale);

      expect(chips.myAccount.label).toBe(ACCOUNT_TEXTS[locale].myAccount);
      expect(chips.deleteAccount.label).toBe(DELETE_ACCOUNT_TEXTS[locale].deleteAccount);
      expect(chips.report.label).toBe(INSPECTION_TEXTS[locale].report);
      expect(chips.syncWithTwitch.label).toBe(MODERATION_TEXTS[locale].syncWithTwitch);
      expect(chips.inspection.label).toBe(INSPECTION_TEXTS[locale].title);
      expect(chips.scoreboard.label).toBe(SCOREBOARD_TEXTS[locale].label);
    }
  });

  // Les six noms du texte validé, dans les deux langues
  it("names the six elements as the validated text does", () => {
    const labelsOf = (locale: "fr" | "en") =>
      NAMES.map((name) => sentenceChips(locale)[name].label.replace(/[  ]/g, " "));

    expect(labelsOf("fr")).toEqual([
      "Mon compte",
      "Supprimer mon compte",
      "Signaler",
      "Synchroniser avec Twitch",
      "Inspection",
      "Classement",
    ]);
    expect(labelsOf("en")).toEqual([
      "My account",
      "Delete my account",
      "Report",
      "Sync with Twitch",
      "Inspection",
      "Scoreboard",
    ]);
  });

  // L'icône et la couleur sont celles du bouton ; Inspection et Classement n'en ont pas
  it("takes the icon and the color of the real button, and none for Inspection and the Scoreboard", () => {
    for (const locale of LOCALES) {
      const chips = sentenceChips(locale);

      expect(chips.myAccount).toMatchObject({ icon: User });
      expect(chips.deleteAccount).toMatchObject({ icon: Trash2, tone: "danger" });
      expect(chips.report).toMatchObject({ icon: Flag });
      expect(chips.syncWithTwitch).toMatchObject({ icon: TwitchGlyph, tone: "twitch" });
      expect(chips.myAccount.tone).toBeUndefined();
      expect(chips.report.tone).toBeUndefined();
      for (const name of ["inspection", "scoreboard"] as const) {
        expect(chips[name].icon).toBeUndefined();
        expect(chips[name].tone).toBeUndefined();
      }
    }
  });

  // Le code des vrais boutons dit la même chose : si l'un change d'icône ou de couleur, la pastille doit le suivre
  it("matches what the code of the real buttons shows", () => {
    const account = source("account/account-window.tsx");
    const inspection = source("inspection/inspection-pill.tsx");
    const moderation = source("moderation/twitch-sync.tsx");
    const twitch = source("design/twitch.tsx");

    expect(account).toMatch(/account: User,/);
    expect(account).toMatch(
      /<Button\s+label=\{deletion\.deleteAccount\}\s+icon=\{Trash2\}\s+variant="danger"/,
    );
    expect(inspection).toMatch(/icon=\{Flag\}\s+label=\{t\.report\}/);
    expect(moderation).toMatch(/<SignInButton[^>]*label=\{[^}]*t\.syncWithTwitch/s);
    expect(twitch).toMatch(/<Button label=\{label\} icon=\{TwitchGlyph\} variant="twitch"/);
  });

  // Le nom de la pill Inspection existe dans les deux langues, et c'est le même mot
  it("names the Inspection pill in both languages", () => {
    expect(INSPECTION_TEXTS.fr.title).toBe("Inspection");
    expect(INSPECTION_TEXTS.en.title).toBe("Inspection");
  });
});

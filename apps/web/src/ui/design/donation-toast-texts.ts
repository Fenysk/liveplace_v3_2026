// Les phrases du toast d'un don (§9.9). La phrase coupe autour du montant : il s'écrit en gras entre les deux moitiés.

import { defineTexts, localized } from "../locale/texts";

type Thanks = { before: string; after: (pixels: string) => string };

export const DONATION_TEXTS = defineTexts({
  thanks: localized<Thanks>({
    fr: {
      before: "Un grand merci pour ce don de ",
      after: (pixels: string) => ` ! ${pixels} pixels offerts à toute la fresque.`,
    },
    en: {
      before: "Huge thanks for this ",
      after: (pixels: string) => ` donation! ${pixels} pixels for the whole canvas.`,
    },
  }),
  claim: localized({
    fr: (pixels: string) => `Réclamer ${pixels} pixels`,
    en: (pixels: string) => `Claim ${pixels} pixels`,
  }),
});

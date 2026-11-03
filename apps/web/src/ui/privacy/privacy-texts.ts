// Les mots de la page Confidentialité (§9.9) : son titre, la ligne qui la dit en chantier, le nom de son sommaire, la section
// Supprimer ton compte, ce que garde un don Ko-fi, et le titre de l'onglet.

import { defineTexts, localized } from "../locale/texts";

export const PRIVACY_TEXTS = defineTexts({
  title: { fr: "Politique de confidentialité", en: "Privacy policy" },
  underConstruction: {
    fr: "Notre politique de confidentialité est tellement confidentielle qu'on ne l'a pas encore écrite.",
    en: "Our privacy policy is so private we haven't even written it yet.",
  },
  documentTitle: { fr: "Confidentialité · LivePlace", en: "Privacy · LivePlace" },
  contentsLabel: { fr: "Sommaire", en: "Contents" },

  // CDC §8 : comment supprimer son compte, puis en combien de temps il sort des sauvegardes (JOURNAL 2026-11-02) : trois phrases, puis
  // l'adresse de contact, pour qui ne peut pas se connecter : seuls les mots autour d'elle se traduisent (CONTACT_ADDRESS).
  deleteAccountTitle: { fr: "Supprimer ton compte", en: "Delete your account" },
  deleteAccountSentences: localized<string[]>({
    fr: [
      "Connecte-toi, ouvre Mon compte, clique Supprimer mon compte.",
      "Un compte sans connexion depuis 2 ans est supprimé de la même façon.",
      "Ton compte sort aussi de nos sauvegardes, en 24 heures au plus.",
    ],
    en: [
      "Sign in, open My account, click Delete my account.",
      "An account with no sign-in for 2 years is deleted the same way.",
      "Your account also leaves our backups, within 24 hours at most.",
    ],
  }),
  deleteAccountContact: localized<{ before: string; after: string }>({
    fr: { before: "Tu ne peux pas te connecter ? Écris à ", after: "." },
    en: { before: "Can't sign in? Write to ", after: "." },
  }),

  // CDC des badges §6 (JOURNAL 2026-11-03) : ce que LivePlace garde d'un don Ko-fi. Jamais le message ; l'e-mail et le nom Ko-fi
  // n'existent que tant que le don n'est pas relié à un compte.
  donationsTitle: { fr: "Tes dons", en: "Your donations" },
  donationsSentences: localized<string[]>({
    fr: [
      "Pour un don sur Ko-fi, on garde le montant et la date : ils donnent le titre et la durée de ton badge Soutien.",
      "On garde l'e-mail et le nom Ko-fi seulement tant que le don n'est pas relié à un compte, puis on les efface.",
      "On ne garde jamais ton message.",
      "Supprimer ton compte efface tes dons.",
    ],
    en: [
      "For a Ko-fi donation, we keep the amount and the date: they set the title and the length of your Supporter badge.",
      "We keep the Ko-fi email and name only until the donation is linked to an account, then we erase them.",
      "We never keep your message.",
      "Deleting your account erases your donations.",
    ],
  }),
});

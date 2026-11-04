// Les mots de la politique de confidentialité (§9.9) : son titre, son en-tête, le titre de l'onglet, puis les 14 sections, chacune
// avec son titre et ses phrases (CDC des textes du 2026-11-04). Une phrase est un texte seul ; si elle porte un lien, ce sont les mots
// avant lui, son nom (document-sections.ts) et les mots après lui. Supprimer ton compte et Tes dons gardent les phrases déjà en ligne.

import type { Sentence } from "../document/document-sections";
import { PUBLISHER_NAME } from "../legal/legal-identity";
import { defineTexts, localized } from "../locale/texts";

export const PRIVACY_TEXTS = defineTexts({
  title: { fr: "Politique de confidentialité", en: "Privacy policy" },
  intro: {
    fr: "Ce que LivePlace garde sur toi, pourquoi, et combien de temps.",
    en: "What LivePlace keeps about you, why, and for how long.",
  },
  updated: localized<(date: string) => string>({
    fr: (date) => `Mise à jour le ${date}.`,
    en: (date) => `Updated on ${date}.`,
  }),
  documentTitle: { fr: "Confidentialité · LivePlace", en: "Privacy · LivePlace" },

  whoTitle: { fr: "Qui s'en occupe", en: "Who is in charge" },
  whoSentences: localized<Sentence[]>({
    fr: [
      `LivePlace est édité par ${PUBLISHER_NAME}, qui décide de ce qu'on fait de tes données.`,
      ["Pour toute question, écris à ", { link: "email" }, "."],
      ["Ses coordonnées complètes sont dans ", { link: "legal" }, "."],
    ],
    en: [
      `LivePlace is published by ${PUBLISHER_NAME}, who decides what is done with your data.`,
      ["For any question, write to ", { link: "email" }, "."],
      ["Full contact details are in ", { link: "legal" }, "."],
    ],
  }),

  accountTitle: { fr: "Ton compte", en: "Your account" },
  accountSentences: localized<Sentence[]>({
    fr: [
      "Tu te connectes avec Twitch. On garde ton ID Twitch, ton pseudo, ton nom affiché, l'adresse de ta photo de profil, la date de création de ton compte et celle de ta dernière connexion.",
      "On garde aussi ton e-mail Twitch, seulement pour relier un don Ko-fi à ton compte. On ne l'affiche jamais et on ne t'écrit jamais.",
      "Si Twitch ne nous donne plus ton e-mail à une connexion, on l'efface.",
      "Si tu arrives par la fresque d'un streamer, on retient laquelle, pour savoir quelles fresques font venir du monde.",
      "Sans compte, tu peux regarder les fresques, mais pas dessiner.",
    ],
    en: [
      "You sign in with Twitch. We keep your Twitch ID, your username, your display name, the address of your profile picture, the date your account was created and the date you last signed in.",
      "We also keep your Twitch email, only to link a Ko-fi donation to your account. We never show it and never write to you.",
      "If Twitch stops giving us your email when you sign in, we erase it.",
      "If you arrive through a streamer's canvas, we remember which one, to know which canvases bring people in.",
      "Without an account, you can watch the canvases, but not draw.",
    ],
  }),

  ownerTitle: { fr: "Si tu es streamer", en: "If you are a streamer" },
  ownerSentences: localized<Sentence[]>({
    fr: [
      [
        "Quand tu cliques ",
        { chip: "syncWithTwitch" },
        ", on lit tes modérateurs et tes bannis, et Twitch nous prévient d'un nouveau ban sur ta chaîne.",
      ],
      "Ils deviennent modérateurs ou bannis sur ta fresque.",
    ],
    en: [
      [
        "When you click ",
        { chip: "syncWithTwitch" },
        ", we read your moderators and your banned users, and Twitch tells us about a new ban on your channel.",
      ],
      "They become moderators or banned users on your canvas.",
    ],
  }),

  drawingsTitle: { fr: "Tes dessins", en: "Your drawings" },
  drawingsSentences: localized<Sentence[]>({
    fr: [
      "Chaque pose garde son auteur, sa date et ses couleurs.",
      [
        "Sur une fresque, n'importe qui peut voir qui a posé un pixel, et quand : c'est l'",
        { chip: "inspection" },
        ". Le ",
        { chip: "scoreboard" },
        " montre aussi les noms.",
      ],
      "On garde ta jauge et ta progression sur chaque fresque.",
      "Tout ça vit tant que la fresque existe, archives comprises.",
      "Si la place manque, on efface d'abord l'historique le plus ancien, jamais celui des 7 derniers jours.",
      "Quand tu supprimes ton compte, ton nom part de chaque fresque ; tes couleurs restent, sans nom.",
      "Quand un streamer supprime une fresque ou son compte, tout ce qui concerne cette fresque part avec.",
    ],
    en: [
      "Each placement keeps its author, its date and its colors.",
      [
        "On a canvas, anyone can see who placed a pixel, and when: that's ",
        { chip: "inspection" },
        ". The ",
        { chip: "scoreboard" },
        " shows names too.",
      ],
      "We keep your gauge and your progress on each canvas.",
      "All of this lives as long as the canvas exists, archives included.",
      "If space runs out, we erase the oldest history first, never the last 7 days.",
      "When you delete your account, your name leaves every canvas; your colors stay, with no name.",
      "When a streamer deletes a canvas or their account, everything about that canvas goes with it.",
    ],
  }),

  moderationTitle: { fr: "La modération", en: "Moderation" },
  moderationSentences: localized<Sentence[]>({
    fr: [
      "Les bans, les signalements, les modérateurs et les dessins effacés sont gardés pour protéger chaque fresque.",
      "Ils vivent tant que la fresque existe, et partent avec ton compte.",
    ],
    en: [
      "Bans, reports, moderators and erased drawings are kept to protect each canvas.",
      "They live as long as the canvas exists, and leave with your account.",
    ],
  }),

  snapshotsTitle: { fr: "Les sauvegardes", en: "Backups" },
  snapshotsSentences: localized<Sentence[]>({
    fr: [
      "On sauvegarde chaque fresque pour la relever après une panne.",
      "Les sauvegardes complètes, avec les auteurs, sont gardées 24 heures (une par heure) et 7 jours (une par jour).",
      "Ensuite, on ne garde que le dessin, sans aucun nom : une sauvegarde par jour jusqu'à 30 jours, puis une par semaine, tant que la fresque existe.",
    ],
    en: [
      "We back up each canvas to bring it back after an outage.",
      "Full backups, with authors, are kept for 24 hours (one per hour) and 7 days (one per day).",
      "After that, we keep only the drawing, with no name at all: one backup per day up to 30 days, then one per week, as long as the canvas exists.",
    ],
  }),

  // CDC §8 : comment supprimer son compte, puis en combien de temps il sort des sauvegardes (JOURNAL 2026-11-02), ce qui reste de l'effacement,
  // et l'adresse de contact, pour qui ne peut pas se connecter
  deleteAccountTitle: { fr: "Supprimer ton compte", en: "Delete your account" },
  deleteAccountSentences: localized<Sentence[]>({
    fr: [
      ["Connecte-toi, ouvre ", { chip: "myAccount" }, ", clique ", { chip: "deleteAccount" }, "."],
      "Un compte sans connexion depuis 2 ans est supprimé de la même façon.",
      "Ton compte sort aussi de nos sauvegardes, en 24 heures au plus.",
      "On garde seulement la preuve de l'effacement, 5 ans : sa date et ce qui l'a lancé, sans ton nom ni ton ID.",
      "Pendant 31 jours, on garde une empreinte de ta session, qui ne mène pas à toi, pour refuser une ancienne connexion.",
      ["Tu ne peux pas te connecter ? Écris à ", { link: "email" }, "."],
    ],
    en: [
      ["Sign in, open ", { chip: "myAccount" }, ", click ", { chip: "deleteAccount" }, "."],
      "An account with no sign-in for 2 years is deleted the same way.",
      "Your account also leaves our backups, within 24 hours at most.",
      "We keep only the proof of the erasure, for 5 years: its date and what started it, without your name or your ID.",
      "For 31 days, we keep a fingerprint of your session, which does not lead back to you, to refuse an old sign-in.",
      ["Can't sign in? Write to ", { link: "email" }, "."],
    ],
  }),

  // CDC des badges §6 (JOURNAL 2026-11-03) : ce que LivePlace garde d'un don Ko-fi. Jamais le message ; l'e-mail et le nom Ko-fi
  // n'existent que tant que le don n'est pas relié à un compte, et un don jamais relié s'efface au bout de 12 mois.
  donationsTitle: { fr: "Tes dons", en: "Your donations" },
  donationsSentences: localized<Sentence[]>({
    fr: [
      "Pour un don sur Ko-fi, on garde le montant et la date : ils donnent le titre et la durée de ton badge Soutien.",
      "On garde l'e-mail et le nom Ko-fi seulement tant que le don n'est pas relié à un compte, puis on les efface.",
      "Un don qui n'est relié à aucun compte au bout de 12 mois est effacé en entier.",
      "On ne garde jamais ton message.",
      "Supprimer ton compte efface tes dons.",
      ["Tu as donné sans compte LivePlace ? Écris à ", { link: "email" }, " pour faire effacer ton don."],
    ],
    en: [
      "For a Ko-fi donation, we keep the amount and the date: they set the title and the length of your Supporter badge.",
      "We keep the Ko-fi email and name only until the donation is linked to an account, then we erase them.",
      "A donation not linked to any account after 12 months is erased entirely.",
      "We never keep your message.",
      "Deleting your account erases your donations.",
      ["Donated without a LivePlace account? Write to ", { link: "email" }, " to have your donation erased."],
    ],
  }),

  audienceTitle: { fr: "La mesure d'audience", en: "Audience measurement" },
  audienceSentences: localized<Sentence[]>({
    fr: [
      "On compte les visites, les viewers actifs et les inscriptions, pour savoir combien de monde vient, et d'où.",
      "Pour compter les visiteurs distincts d'un jour, on garde une trace qui ne dit pas qui ils sont, 31 jours au plus.",
      "Les totaux n'ont aucun nom.",
    ],
    en: [
      "We count visits, active viewers and sign-ups, to know how many people come, and from where.",
      "To count the distinct visitors of a day, we keep a trace that does not say who they are, for 31 days at most.",
      "The totals carry no name.",
    ],
  }),

  browserTitle: { fr: "Ton navigateur", en: "Your browser" },
  browserSentences: localized<Sentence[]>({
    fr: [
      "On pose 3 cookies, tous nécessaires au site : lp_session, ta connexion, 30 jours ; lp_oauth, la connexion en cours, 10 minutes ; lp_locale, ta langue, 1 an.",
      "Ton navigateur garde aussi tes brouillons, la vue de chaque fresque, l'apparence choisie et ce que tu as déjà vu (bulles d'aide, nouveautés). Rien de tout ça ne quitte ton appareil.",
      "Aucun ne te suit sur d'autres sites : c'est pourquoi il n'y a pas de bannière de cookies.",
    ],
    en: [
      "We set 3 cookies, all needed by the site: lp_session, your sign-in, 30 days; lp_oauth, the sign-in in progress, 10 minutes; lp_locale, your language, 1 year.",
      "Your browser also keeps your drafts, the view of each canvas, the appearance you chose and what you have already seen (tips, what's new). None of it leaves your device.",
      "None of them follows you on other sites: that's why there is no cookie banner.",
    ],
  }),

  logsTitle: { fr: "Les journaux et ton adresse IP", en: "Logs and your IP address" },
  logsSentences: localized<Sentence[]>({
    fr: [
      "Nos serveurs ne gardent pas ton adresse IP.",
      "Leurs journaux techniques servent à réparer une panne.",
      "Ceux du système sont effacés au bout de 6 mois au plus ; ceux du site, à chaque mise à jour du site, ou plus tôt quand ils dépassent leur taille.",
    ],
    en: [
      "Our servers do not keep your IP address.",
      "Their technical logs are used to fix outages.",
      "System logs are erased after 6 months at most; the site's logs, at each update of the site, or sooner when they exceed their size.",
    ],
  }),

  servicesTitle: { fr: "Les services qui nous aident", en: "The services that help us" },
  servicesSentences: localized<Sentence[]>({
    fr: [
      "Contabo, en Allemagne, héberge nos serveurs.",
      "Convex garde les comptes, les fresques, les sauvegardes et les dons, sur ses serveurs en Irlande. Convex est une société américaine : les clauses contractuelles types de la Commission européenne encadrent tout accès depuis les États-Unis.",
      "Twitch fournit la connexion et les photos de profil : ton navigateur les charge chez Twitch, qui voit alors ton adresse IP. Twitch est une société américaine, qui suit sa propre politique de confidentialité.",
      "Ko-fi reçoit tes dons et nous envoie le montant, la date, ton e-mail et ton nom Ko-fi.",
      "Google (Gmail) reçoit les e-mails écrits au contact. Google est certifié au cadre de protection des données entre l'Union européenne et les États-Unis.",
      "On ne vend rien, et on ne partage rien avec des publicitaires.",
    ],
    en: [
      "Contabo, in Germany, hosts our servers.",
      "Convex keeps accounts, canvases, backups and donations, on its servers in Ireland. Convex is an American company: the European Commission's standard contractual clauses govern any access from the United States.",
      "Twitch provides sign-in and profile pictures: your browser loads them from Twitch, which then sees your IP address. Twitch is an American company, which follows its own privacy policy.",
      "Ko-fi receives your donations and sends us the amount, the date, your email and your Ko-fi name.",
      "Google (Gmail) receives the emails written to the contact address. Google is certified under the EU-U.S. Data Privacy Framework.",
      "We sell nothing, and share nothing with advertisers.",
    ],
  }),

  legalBasisTitle: { fr: "Pourquoi on a le droit", en: "Why we are allowed to" },
  legalBasisSentences: localized<Sentence[]>({
    fr: [
      "Ton compte, tes dessins et tes dons : c'est le service que tu demandes (RGPD, art. 6.1.b).",
      "Ton e-mail, l'origine de ton compte, un don pas encore relié, la modération, les sauvegardes, la mesure d'audience et les journaux : notre intérêt légitime à faire marcher LivePlace et à le protéger (art. 6.1.f).",
      "La preuve d'un effacement et les e-mails au contact : une obligation légale (art. 6.1.c).",
    ],
    en: [
      "Your account, your drawings and your donations: it's the service you ask for (GDPR, art. 6.1.b).",
      "Your email, where your account came from, a donation not yet linked, moderation, backups, audience measurement and logs: our legitimate interest in running LivePlace and protecting it (art. 6.1.f).",
      "The proof of an erasure and the emails to the contact address: a legal obligation (art. 6.1.c).",
    ],
  }),

  rightsTitle: { fr: "Tes droits", en: "Your rights" },
  rightsSentences: localized<Sentence[]>({
    fr: [
      "Tu peux demander à voir tes données, à les corriger, à les effacer, à en limiter l'usage, à t'y opposer, ou à les recevoir dans un fichier.",
      ["Pour effacer ton compte, le bouton ", { chip: "deleteAccount" }, " suffit."],
      [
        "Pour le reste, écris à ",
        { link: "email" },
        " : on répond en un mois au plus. On garde ces e-mails 1 an après la réponse.",
      ],
      ["Tu peux aussi te plaindre à la CNIL, sur ", { link: "cnil" }, "."],
    ],
    en: [
      "You can ask to see your data, correct it, erase it, limit its use, object to it, or receive it in a file.",
      ["To erase your account, the ", { chip: "deleteAccount" }, " button is enough."],
      [
        "For the rest, write to ",
        { link: "email" },
        ": we answer within one month at most. We keep these emails for 1 year after the answer.",
      ],
      ["You can also complain to the CNIL, the French data protection authority, at ", { link: "cnil" }, "."],
    ],
  }),
});

import { describe, expect, it } from "vitest";
import {
  ARCHIVE_ACTION,
  ARCHIVE_SENTENCE,
  archiveCaption,
  archiveHref,
  archivesCounter,
  bannerCaption,
  bannerTitle,
  CANVAS_NAME_LABEL,
  CURRENT_CANVAS_LABEL,
  canvasTitle,
  currentCanvasCaption,
  currentCanvasTitle,
  datesLabel,
  datesTitle,
  discardSentence,
  missingDisplayName,
  NAME_PLACEHOLDER,
  NAME_SAVED,
  NO_ARCHIVE_SENTENCE,
  NO_CURRENT_CANVAS,
  openArchiveLabel,
  ownerCanvasLabel,
  ownerToast,
  PROGRESS_LABEL,
  progressOptions,
  renameFailureLabel,
  reopenSentence,
  reportsSentence,
  shouldReloadAfter,
  startingName,
  switchFailureLabel,
} from "./archive-texts";

// Midi à Paris : loin des minuits, quel que soit l'heure d'été.
const at = (year: number, month: number, day: number): number => Date.UTC(year, month - 1, day, 10);

describe("datesLabel (Écart §15, JOURNAL 2026-10-06)", () => {
  // Du jour de création au jour d'archivage, dans le même mois
  it("goes from the creation day to the archive day, within one month", () => {
    expect(datesLabel(at(2026, 10, 12), at(2026, 10, 18))).toBe("du 12 au 18 octobre 2026");
  });

  // Dit les deux mois quand ils diffèrent, et les deux années quand elles diffèrent
  it("names both months when they differ, and both years when they differ", () => {
    expect(datesLabel(at(2026, 9, 28), at(2026, 10, 4))).toBe("du 28 septembre au 4 octobre 2026");
    expect(datesLabel(at(2025, 12, 28), at(2026, 1, 3))).toBe("du 28 décembre 2025 au 3 janvier 2026");
  });

  // Un seul jour : « le », et le premier du mois s'écrit « 1er »
  it("says « le » for a single day, and writes the first of the month as « 1er »", () => {
    expect(datesLabel(at(2026, 10, 12), at(2026, 10, 12))).toBe("le 12 octobre 2026");
    expect(datesLabel(at(2026, 10, 1), at(2026, 10, 4))).toBe("du 1er au 4 octobre 2026");
    expect(datesLabel(at(2026, 9, 30), at(2026, 10, 1))).toBe("du 30 septembre au 1er octobre 2026");
  });

  // Sans date d'archivage, le canvas actif : depuis sa création
  it("says since the creation without an archive date, for the active canvas", () => {
    expect(datesLabel(at(2026, 10, 12))).toBe("depuis le 12 octobre 2026");
  });

  // Les jours sont ceux de Paris : 23 h 30 UTC un 12 octobre est déjà le 13 à Paris
  it("counts the days in Paris: 23:30 UTC on 12 October is already the 13th there", () => {
    expect(datesLabel(Date.UTC(2026, 9, 12, 23, 30), at(2026, 10, 20))).toBe("du 13 au 20 octobre 2026");
  });
});

describe("canvasTitle (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le nom d'abord ; sans nom, ses dates, avec une majuscule
  it("is the name first, and without one the dates, capitalised", () => {
    const dates = { createdAt: at(2026, 10, 12), archivedAt: at(2026, 10, 18) };

    expect(canvasTitle({ ...dates, name: "Printemps" })).toBe("Printemps");
    expect(canvasTitle(dates)).toBe("Du 12 au 18 octobre 2026");
    expect(canvasTitle({ createdAt: at(2026, 10, 12) })).toBe("Depuis le 12 octobre 2026");
  });
});

describe("currentCanvasTitle and currentCanvasCaption (Écart §15, JOURNAL 2026-10-06)", () => {
  const createdAt = at(2026, 10, 4);

  // Sans nom : les dates en titre, « Depuis le … », et aucune légende
  it("is « Depuis le … » without a name, and has no caption", () => {
    expect(currentCanvasTitle({ createdAt })).toBe("Depuis le 4 octobre 2026");
    expect(currentCanvasCaption({ createdAt })).toBeNull();
  });

  // Avec un nom : le nom est le titre, la légende dit depuis quand il est en cours
  it("is the name with one, the caption saying since when", () => {
    expect(currentCanvasTitle({ name: "Printemps", createdAt })).toBe("Printemps");
    expect(currentCanvasCaption({ name: "Printemps", createdAt })).toBe("depuis le 4 octobre 2026");
  });
});

describe("archiveCaption (Écart §15, JOURNAL 2026-10-06)", () => {
  const dates = { createdAt: at(2026, 10, 12), archivedAt: at(2026, 10, 18) };

  // Sans nom, les dates sont déjà le titre : pas de légende ; avec un nom, la légende dit les dates
  it("has no caption without a name, the dates being the title, and says the dates under a name", () => {
    expect(archiveCaption(dates)).toBeNull();
    expect(archiveCaption({ ...dates, name: "Printemps" })).toBe("Du 12 au 18 octobre 2026");
  });
});

describe("the labels of the Archives section (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le libellé du canvas en cours, et son bouton : un mot, l'icône dit le reste
  it("labels the current canvas, and its button in one word", () => {
    expect(CURRENT_CANVAS_LABEL).toBe("Canvas en cours");
    expect(ARCHIVE_ACTION).toBe("Archiver");
  });

  // Le lien d'une archive nomme l'archive et dit qu'il ouvre un nouvel onglet : l'icône seule ne le dirait pas
  it("names the link of an archive, saying it opens in a new tab", () => {
    expect(openArchiveLabel("Printemps")).toBe("Ouvrir l'archive Printemps dans un nouvel onglet");
  });
});

describe("the name of the current canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le champ de l'onglet Canvas, et ce que dit le toast quand l'enregistrement a réussi
  it("labels the field of the Canvas section, and confirms the saving", () => {
    expect(CANVAS_NAME_LABEL).toBe("Nom du canvas");
    expect(NAME_SAVED).toBe("Nom enregistré");
  });

  // Chaque échec de l'enregistrement a sa phrase, courte ; la session expirée le dit, les autres invitent à réessayer
  it("gives each failure of the saving its short sentence, asking to try again unless the session expired", () => {
    expect(renameFailureLabel("not_active")).toBe("Le canvas en cours a changé : son nom est rechargé.");
    expect(renameFailureLabel("failed")).toBe("Le nom n'a pas pu être enregistré. Réessaie dans un instant.");
    expect(renameFailureLabel("network")).toBe(renameFailureLabel("failed"));
    expect(renameFailureLabel("unauthenticated")).toBe("Ta session a expiré. Reconnecte-toi, puis réessaie.");
  });
});

describe("archivesCounter and the empty list (Écart §15, JOURNAL 2026-10-06)", () => {
  // « Archives · 1 sur 5 », « Archives · 3 sur 5 » : le libellé de la liste, zéro compris
  it("labels the list with how many archives there are against the maximum, zero included", () => {
    expect(archivesCounter(0, 5)).toBe("Archives · 0 sur 5");
    expect(archivesCounter(1, 5)).toBe("Archives · 1 sur 5");
    expect(archivesCounter(3, 5)).toBe("Archives · 3 sur 5");
    expect(archivesCounter(5, 5)).toBe("Archives · 5 sur 5");
  });

  // L'état vide tient en une phrase, qui dit aussi ce que fait archiver
  it("says in one sentence that there is no archive yet and what archiving does", () => {
    expect(NO_ARCHIVE_SENTENCE).toBe(
      "Aucune archive pour l'instant. Archiver fige ton dessin, avec son lien, et repart sur un canvas vide.",
    );
    expect(NO_CURRENT_CANVAS).toBe("Aucun canvas en cours.");
  });
});

describe("startingName (Écart §15, JOURNAL 2026-10-06)", () => {
  // Archiver propose le nom du canvas actif, que rouvrir une archive lui a laissé : valider tel quel le garde
  it("offers the name of the active canvas when archiving, so confirming as it is keeps the name", () => {
    expect(startingName({ kind: "archive", canvas: { name: "Printemps" } })).toBe("Printemps");
  });

  // Sans nom, le champ est vide ; et rouvrir n'a pas de nom à donner, même si l'archive en a un
  it("is empty for an unnamed canvas, and for reopening even when the archive has a name", () => {
    expect(startingName({ kind: "archive", canvas: {} })).toBe("");
    expect(startingName({ kind: "reopen", archive: { name: "Printemps" } })).toBe("");
  });
});

describe("the sentences of the confirmation windows (Écart §15, JOURNAL 2026-10-06)", () => {
  // Archiver : une phrase, sans aucune dimension
  it("tells what archiving does in one sentence, without a size", () => {
    expect(ARCHIVE_SENTENCE).toBe(
      "Ton dessin est figé et garde son lien. Tes viewers passent sur un canvas vide.",
    );
    expect(ARCHIVE_SENTENCE).not.toMatch(/\d|cases/);
  });

  // Rouvrir : le titre de l'archive, et ce que devient le canvas actuel, sans jargon
  it("tells what reopening does, naming the archive by its title", () => {
    expect(reopenSentence("Printemps")).toBe(
      "« Printemps » remplace ton canvas actuel, qui part dans les archives.",
    );
  });

  // Supprimer : le titre, et pas un mot du lien
  it("tells an archive will be deleted for good, without a word about its link", () => {
    expect(discardSentence("Printemps")).toBe("« Printemps » sera supprimé pour de bon.");
    expect(discardSentence("Printemps")).not.toContain("lien");
  });

  // Le champ du nom montre un exemple
  it("gives the name field an example as its placeholder", () => {
    expect(NAME_PLACEHOLDER).toBe("Ex. : Pixel war de la rentrée");
  });
});

describe("progressOptions (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le choix parle des jauges des viewers, jamais de progression, pour les deux fenêtres
  it("speaks of the gauges of the viewers, never of progression, in both windows", () => {
    expect(PROGRESS_LABEL).toBe("Les jauges des viewers");
    for (const kind of ["archive", "reopen"] as const)
      for (const { label } of progressOptions(kind)) expect(label.toLowerCase()).not.toContain("progression");
  });

  // Des libellés courts, sans note dessous, ceux d'archiver
  it("gives short labels without a note below, for archiving", () => {
    expect(progressOptions("archive")).toEqual([
      { value: "keep", label: "Garder leurs jauges actuelles" },
      { value: "restart", label: "Remettre les jauges au départ" },
    ]);
  });

  // Rouvrir garde le premier, et reprend les jauges de l'archive
  it("gives the same first label and the gauges of the archive as the second, for reopening", () => {
    expect(progressOptions("reopen")).toEqual([
      { value: "keep", label: "Garder leurs jauges actuelles" },
      { value: "restart", label: "Reprendre leurs jauges de cette archive" },
    ]);
  });
});

describe("reportsSentence (Écart §15, JOURNAL 2026-10-06)", () => {
  // Dit combien de signalements attendent, et qu'ils seront classés sans suite ; aucun, la ligne n'existe pas
  it("says how many reports wait and that they will be settled without follow-up, and nothing for none", () => {
    expect(reportsSentence(0)).toBeNull();
    expect(reportsSentence(1)).toBe("1 signalement en attente sera classé sans suite.");
    expect(reportsSentence(12)).toBe("12 signalements en attente seront classés sans suite.");
  });
});

describe("datesTitle and switchFailureLabel (Écart §15, JOURNAL 2026-10-06)", () => {
  // Les dates en tête de phrase : une majuscule, rien d'autre ne change
  it("writes the dates at the head of a sentence: a capital, nothing else changes", () => {
    expect(datesTitle(at(2026, 10, 12), at(2026, 10, 18))).toBe("Du 12 au 18 octobre 2026");
    expect(datesTitle(at(2026, 10, 12))).toBe("Depuis le 12 octobre 2026");
  });

  // Chaque raison d'un changement manqué a sa phrase, qui dit si quelque chose a bougé
  it("gives every reason a change failed its own sentence, saying whether anything moved", () => {
    const reasons = [
      "busy",
      "not_active",
      "not_archive",
      "archives_full",
      "failed",
      "unauthenticated",
      "network",
    ] as const;

    const sentences = reasons.map(switchFailureLabel);

    // `not_active` et `not_archive` disent la même chose : la liste a changé, la voici à jour
    expect(new Set(sentences).size).toBe(reasons.length - 1);
    expect(sentences.every((sentence) => sentence.endsWith("."))).toBe(true);
    expect(switchFailureLabel("archives_full")).toContain("supprime-en une");
    expect(switchFailureLabel("failed")).toContain("rien n'a bougé");
  });

  // Une liste périmée se recharge d'elle-même : la phrase le dit, sans consigne pour la fenêtre ni la section
  it("says the list changed and is up to date when it was stale, without telling to close and reopen", () => {
    for (const reason of ["not_active", "not_archive"] as const) {
      expect(switchFailureLabel(reason)).toBe("La liste a changé : la voici à jour.");
      expect(switchFailureLabel(reason)).not.toContain("Ferme");
    }
  });

  // Sans réponse du serveur, il a pu finir : la phrase ne dit plus que rien n'a bougé, et envoie vérifier la liste
  it("does not say nothing moved when the server did not answer: it may have finished, so the list is to be checked", () => {
    expect(switchFailureLabel("network")).toBe(
      "Pas de réponse du serveur. La liste est rechargée : vérifie-la avant de réessayer.",
    );
    expect(switchFailureLabel("network")).not.toContain("rien n'a bougé");
  });
});

describe("shouldReloadAfter (Écart §15, JOURNAL 2026-10-06)", () => {
  // Recharge la liste quand la page n'est plus à jour, ou quand le serveur a pu finir sans qu'elle le sache
  it("reloads the list when the page is stale or the server may have finished without it knowing", () => {
    for (const reason of ["not_active", "not_archive", "network"] as const)
      expect(shouldReloadAfter(reason)).toBe(true);
  });

  // Les autres refus ne changent rien à la liste : le serveur a refusé, ou tout défait
  it("does not reload for the other refusals, where nothing changed on the server", () => {
    for (const reason of ["busy", "archives_full", "failed", "unauthenticated"] as const)
      expect(shouldReloadAfter(reason)).toBe(false);
  });
});

describe("bannerTitle and bannerCaption (Écart §15, JOURNAL 2026-10-06)", () => {
  const dates = { createdAt: at(2026, 10, 12), archivedAt: at(2026, 10, 18) };

  // Sans nom : « Archive de {nom affiché} », et la légende, ce sont ses dates
  it("is « Archive de {display name} » without a name, the caption being its dates", () => {
    expect(bannerTitle({ displayName: "Kalyss" })).toBe("Archive de Kalyss");
    expect(bannerCaption({ displayName: "Kalyss", ...dates })).toBe("Du 12 au 18 octobre 2026");
    expect(
      bannerCaption({ displayName: "Kalyss", createdAt: at(2026, 10, 12), archivedAt: at(2026, 10, 12) }),
    ).toBe("Le 12 octobre 2026");
  });

  // Avec un nom : le nom est le titre, et la légende dit de qui est l'archive, puis ses dates
  it("is the name with one, the caption saying whose archive it is, then its dates", () => {
    expect(bannerTitle({ displayName: "Kalyss", name: "Printemps" })).toBe("Printemps");
    expect(bannerCaption({ displayName: "Kalyss", name: "Printemps", ...dates })).toBe(
      "Archive de Kalyss · du 12 au 18 octobre 2026",
    );
  });

  // Jamais de « lecture seule » : l'absence d'outils de dessin suffit
  it("never says read-only", () => {
    const texts = [
      bannerTitle({ displayName: "Kalyss" }),
      bannerCaption({ displayName: "Kalyss", ...dates }),
      bannerCaption({ displayName: "Kalyss", name: "Printemps", ...dates }),
    ];

    for (const text of texts) expect(text.toLowerCase()).not.toContain("lecture seule");
  });
});

describe("ownerToast (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le streamer qui archive sait où sont ses viewers ; rouvrir et supprimer gardent leurs mots
  it("tells the streamer who archived where the viewers are, and keeps the words of reopening and discarding", () => {
    expect(ownerToast("archive")).toBe("Canvas archivé : tes viewers sont sur le nouveau.");
    expect(ownerToast("reopen")).toBe("Archive rouverte");
    expect(ownerToast("discard")).toBe("Archive supprimée");
  });
});

describe("archiveHref (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le lien d'une archive est `/{login}/archives/{code}`, sans jamais le canvasId
  it("makes the link of an archive /{login}/archives/{code}, never with the canvasId", () => {
    expect(archiveHref("kalyss", "3mAqXz9RbK")).toBe("/kalyss/archives/3mAqXz9RbK");
  });
});

describe("ownerCanvasLabel (Écart §15, JOURNAL 2026-10-06)", () => {
  // Le nom affiché, pas le pseudo ; sans nom affiché (le pseudo n'existe pas), le pseudo
  it("says the display name, not the login, and the login when the login does not exist at all", () => {
    expect(ownerCanvasLabel({ login: "kalyss", displayName: "Kalyss" })).toBe("Voir le canvas de Kalyss");
    expect(ownerCanvasLabel({ login: "nobody" })).toBe("Voir le canvas de nobody");
  });
});

describe("missingDisplayName (Écart §15, JOURNAL 2026-10-06)", () => {
  // Lit le nom affiché que le loader a joint à l'introuvable, et rien d'autre : `data` n'est connu que comme `unknown`
  it("reads the display name the loader attached to the not-found, and nothing else", () => {
    expect(missingDisplayName({ displayName: "Kalyss" })).toBe("Kalyss");
    for (const attached of [undefined, null, "Kalyss", 12, {}, { displayName: 3 }, { login: "kalyss" }])
      expect(missingDisplayName(attached)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { LOCALES } from "../locale/locale";
import { AUDIENCES, formatReleaseDate, shownReleases } from "./release-notes";
import { RELEASE_NOTES_TEXTS, RELEASES } from "./release-notes-texts";

const NB = "\u00a0"; // l'espace insécable que `defineTexts` écrit avant « : » en français
const NNB = "\u202f"; // l'espace fine insécable qu'elle écrit avant « ? »
const HELLO_WORLD = "Hello world!"; // le seul titre écrit pareil dans les deux langues

describe("les publications des Nouveautés", () => {
  // La plus récente est en haut : les dates descendent, et chacune n'est écrite qu'une fois
  it("lists the most recent release first, each date once", () => {
    const dates = RELEASES.map(({ date }) => date);

    expect(dates.length).toBeGreaterThan(0);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(dates).size).toBe(dates.length);
  });

  // Cinq publications, la plus récente en haut, avec leurs 18 lignes dans l'ordre où Alexis les a validées ; chacune a sa vignette, une seule
  it("holds the five releases of 1 November, 18 October, 11 October, 4 October and 27 September, with their 18 lines in order", () => {
    expect(RELEASES.map(({ date }) => date)).toEqual([
      "2026-11-01",
      "2026-10-18",
      "2026-10-11",
      "2026-10-04",
      "2026-09-27",
    ]);
    expect(
      RELEASES.map(({ lines }) =>
        lines.map(({ audience, texts, thumbnail }) => [audience, texts.fr.title, thumbnail]),
      ),
    ).toEqual([
      [
        ["viewer", "Annuler, refaire", "undo"],
        ["owner", "La fresque grandit seule", "growth"],
      ],
      [["viewer", `Un coup de pouce${NNB}?`, "help"]],
      [
        ["viewer", "Le classement", "scoreboard"],
        ["viewer", "Hello world!", "language"],
        ["viewer", "App mobile", "install"],
        ["viewer", "En live sur Twitch", "live"],
        ["moderator", "Modération facile", "moderation"],
        ["owner", "Archive et recommence", "archives"],
        ["owner", "Choisis ton fond", "backgrounds"],
        ["owner", "Un thème pour la fresque", "theme"],
      ],
      [
        ["viewer", "Signaler un dessin", "report"],
        ["viewer", "La pipette", "eyedropper"],
        ["viewer", "Dessiner au clavier", "keyboard"],
        ["viewer", "Augmente ta jauge", "gauge"],
        ["moderator", "Efface les dessins gênants", "clear"],
        ["owner", "Le format de la fresque", "format"],
      ],
      [["viewer", "Lancement de LivePlace (bêta)", "launch"]],
    ]);
    // Les dix-huit vignettes dessinées gardent leur ligne, chacune une fois
    const lines = RELEASES.flatMap((release) => release.lines);
    expect(lines).toHaveLength(18);
    expect(lines.flatMap(({ thumbnail }) => (thumbnail ? [thumbnail] : [])).sort()).toEqual([
      "archives",
      "backgrounds",
      "clear",
      "eyedropper",
      "format",
      "gauge",
      "growth",
      "help",
      "install",
      "keyboard",
      "language",
      "launch",
      "live",
      "moderation",
      "report",
      "scoreboard",
      "theme",
      "undo",
    ]);
  });

  // Chaque ligne a son titre et sa phrase dans les deux langues, et la version anglaise n'est pas la française (sauf « Hello world! »,
  // qui s'écrit pareil dans les deux)
  it("writes every title and sentence in both languages, English differing from French", () => {
    for (const { lines } of RELEASES)
      for (const { texts } of lines) {
        for (const locale of LOCALES) {
          expect(texts[locale].title.trim()).not.toBe("");
          expect(texts[locale].sentence.trim()).not.toBe("");
        }
        if (texts.fr.title !== HELLO_WORLD) expect(texts.en.title).not.toBe(texts.fr.title);
        expect(texts.en.sentence).not.toBe(texts.fr.sentence);
      }
    expect(HELLO_WORLD).toBe("Hello world!");
  });

  // Les titres et les phrases des 18 lignes, mot pour mot, dans les deux langues : le français validé par Alexis, l'anglais avec les mots
  // de l'interface (eyedropper, cell, report, clear, canvas, viewer, gauge, theme, tutorial)
  it("says the 18 lines in French and in English, word for word", () => {
    const lines = RELEASES.flatMap(({ date, lines: releaseLines }) =>
      releaseLines.map(({ audience, texts }) => ({ date, audience, texts })),
    );

    expect(lines.map(({ date, texts }) => [date, texts.fr.title, texts.fr.sentence])).toEqual([
      [
        "2026-11-01",
        "Annuler, refaire",
        "En Dessin, Ctrl+Z ou la flèche annule ton dernier trait, et l'autre flèche le remet.",
      ],
      [
        "2026-11-01",
        "La fresque grandit seule",
        "Avec la taille dynamique, ta fresque s'agrandit quand un dessin approche d'un bord.",
      ],
      [
        "2026-10-18",
        `Un coup de pouce${NNB}?`,
        "Des bulles t'expliquent les gestes. Tu peux rejouer le tutoriel.",
      ],
      ["2026-10-11", "Le classement", "Découvre qui place le plus de pixels sur la fresque, et ta place."],
      [
        "2026-10-11",
        "Hello world!",
        "Passe LivePlace en français ou en anglais quand tu veux, sans recharger la page.",
      ],
      [
        "2026-10-11",
        "App mobile",
        "Ajoute l'appli sur l'écran d'accueil de ton téléphone, elle s'ouvre en plein écran.",
      ],
      [
        "2026-10-11",
        "En live sur Twitch",
        "Le bouton Twitch d'un profil montre si la personne est en live, et sa catégorie.",
      ],
      [
        "2026-10-11",
        "Modération facile",
        "Un point rouge sur Modération te prévient dès qu'un signalement attend.",
      ],
      [
        "2026-10-11",
        "Archive et recommence",
        "Archive ta fresque, elle garde son lien, et repars sur une fresque vide.",
      ],
      [
        "2026-10-11",
        "Choisis ton fond",
        "Choisis un fond transparent, noir ou blanc, et mets ton image par-dessus.",
      ],
      [
        "2026-10-11",
        "Un thème pour la fresque",
        `Donne un thème à ta fresque${NB}: tous les viewers le voient en haut de l'écran.`,
      ],
      [
        "2026-10-04",
        "Signaler un dessin",
        `Signale un dessin gênant${NB}: les modérateurs le voient et peuvent l'effacer.`,
      ],
      [
        "2026-10-04",
        "La pipette",
        "Prends la couleur d'un pixel de la fresque avec la pipette ou la touche I.",
      ],
      [
        "2026-10-04",
        "Dessiner au clavier",
        "Vise une case avec les flèches du clavier, puis dessine sans souris.",
      ],
      [
        "2026-10-04",
        "Augmente ta jauge",
        `À force de dessiner, un +1 doré apparaît${NB}: réclame-le pour augmenter ta jauge.`,
      ],
      [
        "2026-10-04",
        "Efface les dessins gênants",
        "Efface un seul dessin, une plage d'heures ou tous les dessins d'un viewer.",
      ],
      [
        "2026-10-04",
        "Le format de la fresque",
        `Choisis le format de ta fresque${NB}: carré, paysage ou portrait, en trois tailles.`,
      ],
      [
        "2026-09-27",
        "Lancement de LivePlace (bêta)",
        "Connecte-toi avec Twitch et dessine à plusieurs sur la fresque d'un streamer, ou sur la tienne.",
      ],
    ]);
    expect(lines.map(({ texts }) => [texts.en.title, texts.en.sentence])).toEqual([
      [
        "Undo, redo",
        "In Draw, Ctrl+Z or the arrow undoes your last stroke, and the other arrow brings it back.",
      ],
      [
        "The canvas grows by itself",
        "With dynamic size, your canvas grows when a drawing gets close to an edge.",
      ],
      ["Need a hand?", "Bubbles explain the gestures. You can replay the tutorial."],
      ["The scoreboard", "See who places the most pixels on the canvas, and where you rank."],
      [
        "Hello world!",
        "Switch LivePlace between French and English whenever you like, without reloading the page.",
      ],
      ["Mobile app", "Add the app to your phone's home screen, it opens full screen."],
      ["Live on Twitch", "A profile's Twitch button shows whether that person is live, and their category."],
      ["Easy moderation", "A red dot on Moderation tells you as soon as a report is waiting."],
      ["Archive and start over", "Archive your canvas, it keeps its link, and start over on an empty one."],
      ["Pick your background", "Pick a transparent, black or white background, and put your image on top."],
      ["A theme for your canvas", "Give your canvas a theme: every viewer sees it at the top of the screen."],
      ["Report a drawing", "Report an unwanted drawing: moderators see it and can clear it."],
      ["The eyedropper", "Pick up a pixel's color from the canvas with the eyedropper or the I key."],
      ["Draw with the keyboard", "Aim at a cell with the arrow keys, then draw without a mouse."],
      ["Grow your gauge", "Keep drawing and a golden +1 shows up: claim it to grow your gauge."],
      ["Clear unwanted drawings", "Clear a single drawing, a time range, or all of a viewer's drawings."],
      ["The canvas format", "Pick your canvas format: square, landscape or portrait, in three sizes."],
      [
        "LivePlace launches (beta)",
        "Sign in with Twitch and draw together on a streamer's canvas, or on your own.",
      ],
    ]);
  });

  // Un invité ou un viewer ne voit que les lignes qui s'adressent à tous (11, dans les cinq publications) ; le streamer voit les 18
  it("shows a viewer the eleven lines for everyone, and the owner all eighteen", () => {
    const viewerReleases = shownReleases(RELEASES, ["viewer"]);
    const ownerReleases = shownReleases(RELEASES, AUDIENCES);
    const sizes = (shown: typeof viewerReleases) =>
      shown.map(({ date, byAudience }) => [
        date,
        byAudience.map(({ audience, lines }) => [audience, lines.length]),
      ]);

    expect(sizes(viewerReleases)).toEqual([
      ["2026-11-01", [["viewer", 1]]],
      ["2026-10-18", [["viewer", 1]]],
      ["2026-10-11", [["viewer", 4]]],
      ["2026-10-04", [["viewer", 4]]],
      ["2026-09-27", [["viewer", 1]]],
    ]);
    // Dans l'ordre de l'écran : tous, les modérateurs, les streamers
    expect(sizes(ownerReleases)).toEqual([
      [
        "2026-11-01",
        [
          ["viewer", 1],
          ["owner", 1],
        ],
      ],
      ["2026-10-18", [["viewer", 1]]],
      [
        "2026-10-11",
        [
          ["viewer", 4],
          ["moderator", 1],
          ["owner", 3],
        ],
      ],
      [
        "2026-10-04",
        [
          ["viewer", 4],
          ["moderator", 1],
          ["owner", 1],
        ],
      ],
      ["2026-09-27", [["viewer", 1]]],
    ]);
    expect(viewerReleases.flatMap(({ byAudience }) => byAudience.flatMap(({ lines }) => lines))).toHaveLength(
      11,
    );
    expect(ownerReleases.flatMap(({ byAudience }) => byAudience.flatMap(({ lines }) => lines))).toHaveLength(
      18,
    );
  });
});

describe("les mots des Nouveautés dans les deux langues (§9.9)", () => {
  // Le titre est « Nouveautés » en français et « What's new » en anglais, jamais « news » ni « changelog »
  it("names the feature Nouveautés in French and What's new in English", () => {
    expect(RELEASE_NOTES_TEXTS.fr.title).toBe("Nouveautés");
    expect(RELEASE_NOTES_TEXTS.en.title).toBe("What's new");
    for (const locale of LOCALES)
      expect(JSON.stringify(RELEASE_NOTES_TEXTS[locale])).not.toMatch(/\b(news|changelog)\b/i);
  });

  // Seuls les modérateurs et les streamers ont un titre de groupe, dans la langue de la page ; ce qui s'adresse à tous n'en a pas
  it("titles the moderators and the owners byAudience in both languages, and not the viewers", () => {
    expect(RELEASE_NOTES_TEXTS.fr.audienceTitles).toEqual({
      owner: "Pour les streamers",
      moderator: "Pour les modérateurs",
    });
    expect(RELEASE_NOTES_TEXTS.en.audienceTitles).toEqual({
      owner: "For streamers",
      moderator: "For moderators",
    });
    for (const locale of LOCALES) expect("viewer" in RELEASE_NOTES_TEXTS[locale].audienceTitles).toBe(false);
  });

  // Le nom accessible d'une vignette dit ce qu'elle fait et de quelle ligne elle vient
  it("names a thumbnail by what it does and by its line", () => {
    expect(RELEASE_NOTES_TEXTS.fr.enlarge("Le classement")).toBe("Agrandir : Le classement");
    expect(RELEASE_NOTES_TEXTS.en.enlarge("The scoreboard")).toBe("Enlarge: The scoreboard");
  });

  // La phrase sous le titre de la page dit ce qu'on y lit, dans les deux langues
  it("says what the page holds in one sentence under its title, in each language", () => {
    expect(RELEASE_NOTES_TEXTS.fr.intro).toBe("Ce qui change dans LivePlace, du plus récent au plus ancien.");
    expect(RELEASE_NOTES_TEXTS.en.intro).toBe("What's changing in LivePlace, newest first.");
  });

  // Le titre d'une publication est sa date seule, écrite dans la langue de la page : aucun mot de titre à traduire
  it("titles a release with its date alone, which no text of the page words", () => {
    expect(formatReleaseDate("2026-11-06", "fr")).toBe("6 novembre");
    expect(formatReleaseDate("2026-11-06", "en")).toBe("November 6");
    expect("releaseTitle" in RELEASE_NOTES_TEXTS.fr).toBe(false);
  });

  // Soutenir LivePlace n'est pas dans les Nouveautés : ni sa ligne, ni sa vignette, ni son libellé
  it("says nothing of the support button: no line, no thumbnail, no label", () => {
    const lines = RELEASES.flatMap((release) => release.lines);

    expect(lines.some(({ thumbnail }) => (thumbnail as string | undefined) === "support")).toBe(false);
    expect(JSON.stringify(RELEASES)).not.toMatch(/Soutenir|Support LivePlace|bouton rose|pink button/);
    expect("supportLabel" in RELEASE_NOTES_TEXTS.fr).toBe(false);
  });

  // Le titre de l'onglet est « Nouveautés · LivePlace » dans la langue de la page
  it("writes the title of the tab in each language", () => {
    expect(RELEASE_NOTES_TEXTS.fr.documentTitle).toBe("Nouveautés · LivePlace");
    expect(RELEASE_NOTES_TEXTS.en.documentTitle).toBe("What's new · LivePlace");
  });
});

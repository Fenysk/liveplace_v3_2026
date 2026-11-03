import { describe, expect, it } from "vitest";
import { defineTexts } from "../locale/texts";
import {
  AUDIENCE_DISPLAY_ORDER,
  AUDIENCES,
  audiencesOf,
  formatReleaseDate,
  hasUnreadRelease,
  type Release,
  type ReleaseAudience,
  type ReleaseLine,
  type ReleaseThumbnail,
  seenKey,
  seenKeysOf,
  seenKeysShown,
  shownReleases,
  thumbnailOrders,
} from "./release-notes";
import { createSeenReleases } from "./seen-releases";

const line = (audience: ReleaseAudience, title: string): ReleaseLine => ({
  audience,
  texts: defineTexts({ title: { fr: title, en: title }, sentence: { fr: "Phrase", en: "Sentence" } }),
});

const RELEASES: readonly Release[] = [
  {
    date: "2026-11-20",
    lines: [line("owner", "Pour le streamer")],
  },
  {
    date: "2026-11-06",
    lines: [
      line("viewer", "Pour tous A"),
      line("owner", "Pour le streamer A"),
      line("moderator", "Pour le modérateur"),
      line("owner", "Pour le streamer B"),
      line("viewer", "Pour tous B"),
    ],
  },
];

const titlesOf = (releases: ReturnType<typeof shownReleases>): string[][] =>
  releases.map(({ byAudience }) =>
    byAudience.flatMap(({ lines }) => lines.map(({ texts }) => texts.fr.title)),
  );

const storage = () => {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
};

describe("les publics emboîtés d'un rôle", () => {
  // Quand le rôle est streamer sur son canvas, le système doit montrer les trois publics, dans l'ordre des groupes
  it("gives the owner the three audiences, in the order of the byAudience", () => {
    expect(audiencesOf("owner")).toEqual(["owner", "moderator", "viewer"]);
    expect([...AUDIENCES]).toEqual(["owner", "moderator", "viewer"]);
  });

  // Quand le rôle est modérateur de ce canvas, le système doit montrer les modérateurs et tous
  it("gives the moderator the moderators and everyone", () => {
    expect(audiencesOf("moderator")).toEqual(["moderator", "viewer"]);
  });

  // Quand le rôle est viewer, invité ou pas encore connu, le système doit montrer « tous » seulement
  it("gives a viewer, a guest and a role not yet known the viewers' lines only", () => {
    expect(audiencesOf("viewer")).toEqual(["viewer"]);
    expect(audiencesOf("guest")).toEqual(["viewer"]);
    expect(audiencesOf(undefined)).toEqual(["viewer"]);
  });
});

describe("ce qu'un public voit des publications", () => {
  // Quand un viewer lit les publications, le système doit ne lui montrer que les lignes « tous », sans les autres groupes
  it("keeps only the viewers' lines for a viewer", () => {
    expect(titlesOf(shownReleases(RELEASES, ["viewer"]))).toEqual([["Pour tous A", "Pour tous B"]]);
  });

  // Si une publication n'a aucune ligne pour les publics visibles, alors le système ne doit pas l'afficher
  it("drops a release that has no line for the visible audiences", () => {
    const shown = shownReleases(RELEASES, ["moderator", "viewer"]);

    expect(shown.map(({ date }) => date)).toEqual(["2026-11-06"]);
    expect(shownReleases(RELEASES, ["owner", "moderator", "viewer"]).map(({ date }) => date)).toEqual([
      "2026-11-20",
      "2026-11-06",
    ]);
  });

  // Les groupes s'écrivent toujours tous, modérateurs, streamers (ce qui parle à tout le monde d'abord), et les lignes gardent l'ordre de la liste
  it("writes the byAudience as everyone, moderators, then owners, and keeps the order of the lines", () => {
    const [release] = shownReleases(RELEASES.slice(1), ["owner", "moderator", "viewer"]);

    expect(release?.byAudience.map(({ audience }) => audience)).toEqual(["viewer", "moderator", "owner"]);
    expect([...AUDIENCE_DISPLAY_ORDER]).toEqual(["viewer", "moderator", "owner"]);
    expect(titlesOf(shownReleases(RELEASES.slice(1), AUDIENCES))).toEqual([
      ["Pour tous A", "Pour tous B", "Pour le modérateur", "Pour le streamer A", "Pour le streamer B"],
    ]);
  });

  // La plus récente reste en haut : l'ordre de la liste est celui de l'écran
  it("keeps the most recent release first", () => {
    expect(shownReleases(RELEASES, AUDIENCES).map(({ date }) => date)).toEqual(["2026-11-20", "2026-11-06"]);
  });
});

describe("le point des Nouveautés (lu, non lu)", () => {
  // Tant que rien n'est lu, le point est allumé
  it("lights the dot while nothing is read", () => {
    const seen = createSeenReleases(storage);

    expect(hasUnreadRelease(RELEASES, ["viewer"], seen.isRead)).toBe(true);
  });

  // Quand les lignes de la dernière publication sont lues pour les publics visibles, le point s'éteint
  it("puts the dot out once the latest release is read for the visible audiences", () => {
    const seen = createSeenReleases(storage);
    seen.markRead(seenKey("2026-11-06", "viewer"));

    expect(hasUnreadRelease(RELEASES, ["viewer"], seen.isRead)).toBe(false);
  });

  // La publication la plus récente seule compte : une plus ancienne non lue n'allume rien
  it("counts the most recent release only", () => {
    const seen = createSeenReleases(storage);
    seen.markRead(seenKey("2026-11-20", "owner"));

    expect(hasUnreadRelease(RELEASES, ["owner", "moderator", "viewer"], seen.isRead)).toBe(false);
  });

  // Une ligne pour un public qui n'est pas visible n'allume pas le point : le viewer ne voit rien de ce qu'il ne peut pas lire
  it("is not lit by the lines of an audience that is not visible", () => {
    const seen = createSeenReleases(storage);
    seen.markRead(seenKey("2026-11-06", "viewer"));

    expect(hasUnreadRelease(RELEASES, ["viewer"], seen.isRead)).toBe(false);
    expect(hasUnreadRelease(RELEASES, ["owner", "moderator", "viewer"], seen.isRead)).toBe(true);
  });

  // Sur une fresque sans ligne pour les publics visibles, aucune publication : pas de point
  it("has no dot when no release speaks to the visible audiences", () => {
    expect(hasUnreadRelease([RELEASES[0] as Release], ["viewer"], () => false)).toBe(false);
    expect(hasUnreadRelease([], ["viewer"], () => false)).toBe(false);
  });

  // Ouvrir la section marque comme lues les lignes des publics visibles, publication par publication, et elles seules
  it("marks as read the lines of the visible audiences only, release by release", () => {
    expect(seenKeysShown(RELEASES, ["viewer"])).toEqual([seenKey("2026-11-06", "viewer")]);
    expect(seenKeysShown(RELEASES, ["owner", "moderator", "viewer"])).toEqual([
      seenKey("2026-11-20", "owner"),
      seenKey("2026-11-06", "viewer"),
      seenKey("2026-11-06", "moderator"),
      seenKey("2026-11-06", "owner"),
    ]);
  });

  // Le lu est retenu par publication et par public : deux clés qui ne se confondent jamais
  it("keeps what is read by release and by audience, in keys that never collide", () => {
    const keys = seenKeysOf(RELEASES);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(seenKey("2026-11-06", "viewer"));
    expect(keys).toContain(seenKey("2026-11-20", "owner"));
    expect(seenKey("2026-11-06", "viewer")).not.toBe(seenKey("2026-11-06", "owner"));
    expect(seenKey("2026-11-06", "viewer")).not.toBe(seenKey("2026-11-20", "viewer"));
    expect(keys).toHaveLength(2 * AUDIENCES.length);
  });
});

describe("la date d'une publication, dans la langue de la page", () => {
  // La date s'écrit en toutes lettres, sans l'année, dans la langue de la page
  it("writes the day and the month in full, in the language of the page", () => {
    expect(formatReleaseDate("2026-11-06", "fr")).toBe("6 novembre");
    expect(formatReleaseDate("2026-11-06", "en")).toBe("November 6");
    expect(formatReleaseDate("2026-12-31", "fr")).toBe("31 décembre");
  });

  // Le premier du mois s'écrit « 1er » en français
  it("writes the first of the month as 1er in French", () => {
    expect(formatReleaseDate("2026-12-01", "fr")).toBe("1er décembre");
    expect(formatReleaseDate("2026-12-01", "en")).toBe("December 1");
  });
});

// Des lignes avec ou sans vignette : seule la vignette prend un rang.
const shotLine = (audience: ReleaseAudience, title: string, thumbnail?: ReleaseThumbnail): ReleaseLine => ({
  ...line(audience, title),
  ...(thumbnail ? { thumbnail } : {}),
});

describe("l'ordre de lecture des vignettes", () => {
  const NEWEST_ALL = shotLine("viewer", "Récente pour tous", "growth");
  const NEWEST_MODERATOR = shotLine("moderator", "Récente modérateurs", "undo");
  const NEWEST_OWNER = shotLine("owner", "Récente streamers", "archives");
  const OLDER_ALL = shotLine("viewer", "Ancienne pour tous", "scoreboard");
  const OLDER_WITHOUT = shotLine("viewer", "Ancienne sans vignette");
  const OLDER_OWNER = shotLine("owner", "Ancienne streamers", "clear");
  const THUMBNAIL_RELEASES: readonly Release[] = [
    // Dans la liste, le streamer vient avant le viewer : l'ordre de l'écran n'est pas celui de la liste.
    { date: "2026-11-20", lines: [NEWEST_OWNER, NEWEST_MODERATOR, NEWEST_ALL] },
    { date: "2026-11-06", lines: [OLDER_ALL, OLDER_WITHOUT, OLDER_OWNER] },
  ];
  const ordersOf = (audiences: readonly ReleaseAudience[]) =>
    thumbnailOrders(shownReleases(THUMBNAIL_RELEASES, audiences));

  // Les vignettes se lisent de la première publication à la dernière, groupe par groupe, ligne par ligne, à partir de 0
  it("numbers the thumbnails from 0 in reading order: release by release, group by group", () => {
    const orders = ordersOf(AUDIENCES);

    expect(orders.get(NEWEST_ALL)).toBe(0);
    expect(orders.get(NEWEST_MODERATOR)).toBe(1);
    expect(orders.get(NEWEST_OWNER)).toBe(2);
    expect(orders.get(OLDER_ALL)).toBe(3);
    expect(orders.get(OLDER_OWNER)).toBe(4);
  });

  // Une ligne sans vignette ne prend pas de rang : la suivante prend le sien
  it("gives no order to a line without a thumbnail", () => {
    const orders = ordersOf(AUDIENCES);

    expect(orders.has(OLDER_WITHOUT)).toBe(false);
    expect(orders.size).toBe(5);
  });

  // Chaque liste a son propre ordre : la fenêtre d'un viewer ne compte que ce qu'elle montre, et recommence à 0
  it("counts only the thumbnails each audience shows, from 0 again", () => {
    const viewer = ordersOf(["viewer"]);
    const moderator = ordersOf(["moderator", "viewer"]);

    expect([viewer.get(NEWEST_ALL), viewer.get(OLDER_ALL), viewer.size]).toEqual([0, 1, 2]);
    expect([moderator.get(NEWEST_ALL), moderator.get(NEWEST_MODERATOR), moderator.get(OLDER_ALL)]).toEqual([
      0, 1, 2,
    ]);
    expect(moderator.has(NEWEST_OWNER)).toBe(false);
  });
});

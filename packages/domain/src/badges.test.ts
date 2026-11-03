import { describe, expect, it } from "vitest";
import {
  BADGES,
  composeBadges,
  getBadge,
  isBadgeId,
  parseSupportMirror,
  supportBadgeId,
  toKnownBadges,
} from "./badges";
import { SUPPORT_TITLES } from "./support";

const NOW = Date.UTC(2026, 10, 3, 12);
const IN_A_YEAR = Date.UTC(2027, 10, 3, 12);

describe("le catalogue des badges (CDC des badges §2)", () => {
  // Quand un viewer porte les deux badges, Modérateur se montre avant Soutien (choix du 03/11)
  it("puts Moderator before every Support title", () => {
    expect(BADGES.map(({ id }) => id)).toEqual([
      "moderator",
      "support.supporter",
      "support.regular",
      "support.drivingForce",
      "support.pillar",
      "support.keystone",
    ]);
  });

  // Chaque titre de Soutien a son id : un titre de plus dans support.ts sans id ici se verrait
  it("gives every Support title its id, global in scope", () => {
    for (const title of SUPPORT_TITLES) {
      expect(isBadgeId(supportBadgeId(title))).toBe(true);
      expect(getBadge(supportBadgeId(title))).toMatchObject({ scope: "global", family: "support", title });
    }
    expect(getBadge("moderator")).toMatchObject({ scope: "canvas", family: "moderator" });
  });

  // Un id ne se réutilise jamais : deux entrées de même id se masqueraient
  it("never repeats an id", () => {
    expect(new Set(BADGES.map(({ id }) => id)).size).toBe(BADGES.length);
  });
});

describe("toKnownBadges", () => {
  // Quand le gateway est plus récent que le client, l'id inconnu est ignoré sans erreur
  it("ignores an id the catalogue does not know", () => {
    expect(toKnownBadges(["pixels.2", "moderator", "pioneer"])).toEqual(["moderator"]);
  });

  // Les ids se rangent dans l'ordre du catalogue, sans doublon, quel que soit l'ordre reçu
  it("orders by the catalogue and drops duplicates", () => {
    expect(toKnownBadges(["support.pillar", "moderator", "support.pillar"])).toEqual([
      "moderator",
      "support.pillar",
    ]);
  });

  // Absent : aucun badge
  it("gives nothing for no list", () => {
    expect(toKnownBadges(undefined)).toEqual([]);
    expect(toKnownBadges([])).toEqual([]);
  });
});

describe("parseSupportMirror", () => {
  it("reads the title and the end of a mirror", () => {
    expect(parseSupportMirror("regular", String(IN_A_YEAR))).toEqual({ title: "regular", endsAt: IN_A_YEAR });
  });

  // Un titre inconnu, une date illisible ou absente : aucun Soutien, jamais une erreur à l'affichage
  it("gives nothing for a damaged mirror", () => {
    expect(parseSupportMirror("legend", String(IN_A_YEAR))).toBeNull();
    expect(parseSupportMirror("regular", "bientôt")).toBeNull();
    expect(parseSupportMirror("regular", undefined)).toBeNull();
    expect(parseSupportMirror(undefined, String(IN_A_YEAR))).toBeNull();
  });
});

describe("composeBadges (CDC des badges §3)", () => {
  // Tant que la date de fin n'est pas passée, le Soutien se montre avec son titre
  it("shows Support while its end is ahead", () => {
    expect(
      composeBadges({ isModerator: false, support: { title: "pillar", endsAt: IN_A_YEAR } }, NOW),
    ).toEqual(["support.pillar"]);
  });

  // Un Soutien expiré ne part pas, à la milliseconde de sa fin comme après
  it("drops Support once its end is reached", () => {
    const support = { title: "pillar", endsAt: NOW } as const;
    expect(composeBadges({ isModerator: false, support }, NOW)).toEqual([]);
    expect(composeBadges({ isModerator: false, support }, NOW + 1)).toEqual([]);
    expect(composeBadges({ isModerator: false, support }, NOW - 1)).toEqual(["support.pillar"]);
  });

  // Modérateur et Soutien se cumulent, dans l'ordre fixe
  it("lists Moderator, then Support", () => {
    expect(
      composeBadges({ isModerator: true, support: { title: "supporter", endsAt: IN_A_YEAR } }, NOW),
    ).toEqual(["moderator", "support.supporter"]);
  });

  // Ni modérateur ni Soutien : aucun badge
  it("gives nothing to a viewer with neither", () => {
    expect(composeBadges({ isModerator: false }, NOW)).toEqual([]);
    expect(composeBadges({ isModerator: false, support: null }, NOW)).toEqual([]);
  });

  // Modérateur seul ne dépend pas de l'heure
  it("gives Moderator alone", () => {
    expect(composeBadges({ isModerator: true }, NOW)).toEqual(["moderator"]);
  });
});

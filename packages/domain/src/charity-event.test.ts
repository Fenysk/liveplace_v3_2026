import { describe, expect, it } from "vitest";
import {
  CENTS_PER_PIXEL,
  CHARITY_TITLE_MAX_LENGTH,
  type CharityEventSetting,
  charityAddressHref,
  charityCountdownDelayMs,
  charityCountdownOf,
  charityEndCountdownOf,
  charityEventStatusOf,
  charityGate,
  charityInactiveReasonOf,
  isDonationInCharityEvent,
  parseCharityAddress,
  pixelsOfCents,
  toCharityTitle,
} from "./charity-event";
import { OPEN_DRAWING } from "./live-only";

describe("pixelsOfCents", () => {
  it("donne 10 pixels par euro, soit 1 pixel pour 10 centimes", () => {
    expect(CENTS_PER_PIXEL).toBe(10);
    expect(pixelsOfCents(100)).toBe(10);
    expect(pixelsOfCents(1500)).toBe(150);
  });

  it("arrondit vers le bas", () => {
    expect(pixelsOfCents(0)).toBe(0);
    expect(pixelsOfCents(9)).toBe(0);
    expect(pixelsOfCents(19)).toBe(1);
    expect(pixelsOfCents(1234)).toBe(123);
  });
});

describe("parseCharityAddress", () => {
  it("lit la page personnelle", () => {
    expect(parseCharityAddress("https://streamlabscharity.com/@dageecheegamer/dames-4-games-2026")).toEqual({
      kind: "user",
      user: "dageecheegamer",
      campaign: "dames-4-games-2026",
    });
  });

  it("lit la page d'un membre d'équipe", () => {
    expect(
      parseCharityAddress(
        "https://streamlabscharity.com/teams/@zevent-2026/zevent-2026?member=556591525052683658",
      ),
    ).toEqual({ kind: "team", team: "zevent-2026", campaign: "zevent-2026", memberId: "556591525052683658" });
  });

  it("lit la page de l'équipe entière, sans membre", () => {
    expect(parseCharityAddress("streamlabscharity.com/teams/@zevent-2026/zevent-2026")).toEqual({
      kind: "team",
      team: "zevent-2026",
      campaign: "zevent-2026",
    });
  });

  it("accepte sans protocole, avec www, des espaces autour et une barre finale", () => {
    expect(parseCharityAddress("  www.streamlabscharity.com/@a_b/c-1/  ")).toEqual({
      kind: "user",
      user: "a_b",
      campaign: "c-1",
    });
  });

  it.each([
    ["", "vide"],
    ["https://example.com/@a/b", "un autre site"],
    ["https://streamlabscharity.com.evil.test/@a/b", "un faux sous-domaine"],
    ["https://streamlabscharity.com/@a", "sans campagne"],
    ["https://streamlabscharity.com/a/b", "sans @"],
    ["https://streamlabscharity.com/@a/b/c", "un segment de trop"],
    ["https://streamlabscharity.com/teams/@a", "une équipe sans campagne"],
    ["https://streamlabscharity.com/teams/@a/b?member=abc", "un membre qui n'est pas un nombre"],
    ["https://user:pass@streamlabscharity.com/@a/b", "des identifiants dans l'adresse"],
    ["https://streamlabscharity.com/@a b/c", "un espace dans le nom"],
    ["pas une adresse", "du texte"],
  ])("refuse %s (%s)", (address) => {
    expect(parseCharityAddress(address)).toBeNull();
  });
});

describe("les états de l'événement", () => {
  const dates = { startsAt: 1_000, endsAt: 2_000 };

  const setting: CharityEventSetting = {
    isEnabled: true,
    title: "Live du soir",
    address: "streamlabscharity.com/@a/b",
    startsAt: 1_000,
    endsAt: 2_000,
  };

  it("passe de à venir à en cours, puis à terminé quand la fin est passée", () => {
    expect(charityEventStatusOf(setting, 999)).toEqual({ kind: "upcoming", startsAt: 1_000 });
    expect(charityEventStatusOf(setting, 1_000)).toEqual({ kind: "running" });
    expect(charityEventStatusOf(setting, 1_999)).toEqual({ kind: "running" });
    expect(charityEventStatusOf(setting, 2_000)).toEqual({ kind: "ended" });
    expect(charityEventStatusOf(setting, 9e15)).toEqual({ kind: "ended" });
  });

  // Après la fin, un autre défaut du réglage reste dit tel quel : « terminé » ne vaut que pour un réglage valide par ailleurs
  it("stays inactive for another fault after the end, and is off when the switch is off", () => {
    expect(charityEventStatusOf({ ...setting, title: "" }, 2_500)).toEqual({
      kind: "inactive",
      reason: "title",
    });
    expect(charityEventStatusOf({ ...setting, address: "https://example.com/x" }, 2_500)).toEqual({
      kind: "inactive",
      reason: "address",
    });
    expect(charityEventStatusOf({ ...setting, isEnabled: false }, 2_500)).toEqual({ kind: "off" });
  });

  it("est désactivé quel que soit le reste du réglage", () => {
    expect(charityEventStatusOf({ ...setting, isEnabled: false }, 1_500)).toEqual({ kind: "off" });
    expect(charityEventStatusOf({ isEnabled: false, title: "" }, 1_500)).toEqual({ kind: "off" });
  });

  it("compte un don fait entre le début et la fin, bornes comprises", () => {
    expect(isDonationInCharityEvent(999, dates)).toBe(false);
    expect(isDonationInCharityEvent(1_000, dates)).toBe(true);
    expect(isDonationInCharityEvent(2_000, dates)).toBe(true);
    expect(isDonationInCharityEvent(2_001, dates)).toBe(false);
  });

  it("donne la raison d'inactivité, dans l'ordre : titre, début, ordre, adresse", () => {
    expect(charityInactiveReasonOf(setting)).toBeNull();
    expect(charityInactiveReasonOf({ ...setting, title: "" })).toBe("title");
    expect(charityInactiveReasonOf({ ...setting, title: "", startsAt: undefined })).toBe("title");
    expect(charityInactiveReasonOf({ ...setting, startsAt: undefined })).toBe("start");
    expect(charityInactiveReasonOf({ ...setting, startsAt: 2_000 })).toBe("order");
    expect(charityInactiveReasonOf({ ...setting, startsAt: 3_000 })).toBe("order");
    expect(charityInactiveReasonOf(setting)).toBeNull(); // la fin passée n'est plus une raison
    expect(charityInactiveReasonOf({ ...setting, address: "https://example.com/x" })).toBe("address");
  });

  // La fin est facultative : sans elle, seul un début manquant rend l'événement inactif, et il ne passe jamais
  it("has no inactive reason without an end, as long as it has a start, and never ends", () => {
    const open: CharityEventSetting = { ...setting, endsAt: undefined };
    expect(charityInactiveReasonOf(open)).toBeNull();
    expect(charityInactiveReasonOf(open)).toBeNull();
    expect(charityInactiveReasonOf({ ...open, startsAt: undefined })).toBe("start");
    expect(charityInactiveReasonOf({ ...open, title: "" })).toBe("title");
    expect(charityInactiveReasonOf({ ...open, address: "https://example.com/x" })).toBe("address");
    expect(charityEventStatusOf(open, 999)).toEqual({ kind: "upcoming", startsAt: 1_000 });
    expect(charityEventStatusOf(open, 1_000)).toEqual({ kind: "running" });
    expect(charityEventStatusOf(open, 9e15)).toEqual({ kind: "running" });
  });

  // Sans fin, un don compte dès le début, sans limite
  it("counts a donation after the start without an end", () => {
    expect(isDonationInCharityEvent(999, { startsAt: 1_000 })).toBe(false);
    expect(isDonationInCharityEvent(1_000, { startsAt: 1_000 })).toBe(true);
    expect(isDonationInCharityEvent(9e15, { startsAt: 1_000 })).toBe(true);
  });

  it("accepte une adresse vide : l'événement a lieu sans page de dons", () => {
    expect(charityInactiveReasonOf({ ...setting, address: undefined })).toBeNull();
    expect(charityInactiveReasonOf({ ...setting, address: "  " })).toBeNull();
    expect(charityEventStatusOf({ ...setting, address: "" }, 500)).toEqual({
      kind: "upcoming",
      startsAt: 1_000,
    });
  });
});

describe("le compte à rebours", () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("compte en jours et heures à partir d'un jour", () => {
    expect(charityCountdownOf(2 * DAY + 5 * HOUR + 59 * MIN)).toEqual({ unit: "days", days: 2, hours: 5 });
    expect(charityCountdownOf(DAY)).toEqual({ unit: "days", days: 1, hours: 0 });
  });

  it("compte en heures et minutes sous un jour", () => {
    expect(charityCountdownOf(DAY - 1)).toEqual({ unit: "hours", hours: 23, minutes: 59 });
    expect(charityCountdownOf(5 * HOUR + 12 * MIN + 30_000)).toEqual({
      unit: "hours",
      hours: 5,
      minutes: 12,
    });
    expect(charityCountdownOf(HOUR)).toEqual({ unit: "hours", hours: 1, minutes: 0 });
  });

  it("compte en minutes et secondes sous une heure, sans passer sous zéro", () => {
    expect(charityCountdownOf(HOUR - 1)).toEqual({ unit: "minutes", minutes: 59, seconds: 59 });
    expect(charityCountdownOf(12 * MIN + 30_000)).toEqual({ unit: "minutes", minutes: 12, seconds: 30 });
    expect(charityCountdownOf(-5)).toEqual({ unit: "minutes", minutes: 0, seconds: 0 });
  });

  it("change d'affichage au bon moment, et au plus tard au début", () => {
    expect(charityCountdownDelayMs(2 * DAY + 5 * HOUR)).toBe(1);
    expect(charityCountdownDelayMs(2 * DAY + 5 * HOUR + 1_800_000)).toBe(1_800_001);
    expect(charityCountdownDelayMs(5 * HOUR + 12 * MIN + 30_000)).toBe(30_001);
    expect(charityCountdownDelayMs(12 * MIN + 30_400)).toBe(401);
    expect(charityCountdownDelayMs(300)).toBe(300);
  });
});

describe("le compte à rebours de la fin", () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;

  // Il n'apparaît que dans la dernière heure ; à une heure pile, la pastille dit encore « En cours »
  it("shows only strictly under one hour before the end, in minutes and seconds", () => {
    expect(charityEndCountdownOf(HOUR)).toBeNull();
    expect(charityEndCountdownOf(HOUR + 1)).toBeNull();
    expect(charityEndCountdownOf(HOUR - 1)).toEqual({ unit: "minutes", minutes: 59, seconds: 59 });
    expect(charityEndCountdownOf(12 * MIN + 30_000)).toEqual({ unit: "minutes", minutes: 12, seconds: 30 });
    expect(charityEndCountdownOf(0)).toEqual({ unit: "minutes", minutes: 0, seconds: 0 });
  });
});

describe("charityAddressHref", () => {
  // Le lien n'existe que pour une adresse de dons valide, et c'est une adresse https complète
  it("gives the https address of a valid donation page, and null otherwise", () => {
    expect(charityAddressHref("streamlabscharity.com/@a/b")).toBe("https://streamlabscharity.com/@a/b");
    expect(charityAddressHref("  https://www.streamlabscharity.com/@a/b  ")).toBe(
      "https://www.streamlabscharity.com/@a/b",
    );
    expect(charityAddressHref("https://streamlabscharity.com/teams/@t/c?member=12")).toBe(
      "https://streamlabscharity.com/teams/@t/c?member=12",
    );
    expect(charityAddressHref("")).toBeNull();
    expect(charityAddressHref("https://example.com/@a/b")).toBeNull();
    expect(charityAddressHref("javascript:alert(1)")).toBeNull();
  });
});

describe("toCharityTitle", () => {
  it("a la même longueur que le thème", () => {
    expect(CHARITY_TITLE_MAX_LENGTH).toBe(40);
  });

  it("nettoie les espaces et les caractères de contrôle", () => {
    expect(toCharityTitle("  Live   du \n soir\t")).toBe("Live du soir");
  });

  it("coupe à la longueur maximale par point de code", () => {
    expect(toCharityTitle("x".repeat(60))).toBe("x".repeat(40));
    expect(Array.from(toCharityTitle("\u{1F600}".repeat(60)))).toHaveLength(40);
  });

  it("rend un titre vide : l'événement est alors inactif", () => {
    expect(toCharityTitle("")).toBe("");
    expect(toCharityTitle("   ")).toBe("");
  });
});

describe("charityGate : le dessin seulement pendant l'événement", () => {
  const setting: CharityEventSetting = {
    isEnabled: true,
    title: "Live du soir",
    startsAt: 1_000,
    endsAt: 2_000,
    isEventOnly: true,
  };

  // Avant le début, le viewer ne dessine pas, et le dessin s'ouvre au début
  it("closes before the start and says when it opens", () => {
    expect(charityGate(setting, "viewer", 999)).toEqual({ isClosed: true, opensAt: 1_000 });
  });

  // Pendant la fenêtre, le dessin est ouvert jusqu'à la fin ; le début compte, la fin non
  it("is open from the start up to the end, which closes it", () => {
    expect(charityGate(setting, "viewer", 1_000)).toEqual({ isClosed: false, closesAt: 2_000 });
    expect(charityGate(setting, "moderator", 1_999)).toEqual({ isClosed: false, closesAt: 2_000 });
    expect(charityGate(setting, "viewer", 2_000)).toEqual({ isClosed: true });
    expect(charityGate(setting, "viewer", 9_000)).toEqual({ isClosed: true });
  });

  // Le streamer dessine toujours, l'invité n'est pas concerné
  it("never closes for the owner, and ignores guests", () => {
    expect(charityGate(setting, "owner", 5_000)).toEqual(OPEN_DRAWING);
    expect(charityGate(setting, "guest", 5_000)).toEqual(OPEN_DRAWING);
  });

  // Le switch éteint ne bloque rien
  it("blocks nothing when the switch is off", () => {
    expect(charityGate({ ...setting, isEnabled: false }, "viewer", 5_000)).toEqual(OPEN_DRAWING);
  });

  // Sans le drapeau (ou sans réglage), le dessin reste ouvert
  it("stays open without the flag, or without a setting", () => {
    expect(charityGate({ ...setting, isEventOnly: false }, "viewer", 5_000)).toEqual(OPEN_DRAWING);
    const withoutFlag: CharityEventSetting = {
      isEnabled: true,
      title: "Live",
      startsAt: 1_000,
      endsAt: 2_000,
    };
    expect(charityGate(withoutFlag, "viewer", 5_000)).toEqual(OPEN_DRAWING);
    expect(charityGate(undefined, "viewer", 5_000)).toEqual(OPEN_DRAWING);
  });

  // Sans fin : fermé avant le début avec son ouverture, ouvert ensuite sans heure de fermeture
  it("without an end, closes before the start and stays open after it, with no closing time", () => {
    const open: CharityEventSetting = { ...setting, endsAt: undefined };
    expect(charityGate(open, "viewer", 999)).toEqual({ isClosed: true, opensAt: 1_000 });
    expect(charityGate(open, "viewer", 1_000)).toEqual({ isClosed: false });
    expect(charityGate(open, "moderator", 9e15)).toEqual({ isClosed: false });
    expect(charityGate(open, "owner", 999)).toEqual(OPEN_DRAWING);
  });

  // Un événement sans son début, ou aux dates dans le mauvais ordre, n'a pas lieu : rien n'est fermé
  it("stays open when the start is missing or the dates are reversed", () => {
    expect(charityGate({ ...setting, startsAt: undefined }, "viewer", 5_000)).toEqual(OPEN_DRAWING);
    expect(charityGate({ ...setting, startsAt: 3_000 }, "viewer", 5_000)).toEqual(OPEN_DRAWING);
  });
});

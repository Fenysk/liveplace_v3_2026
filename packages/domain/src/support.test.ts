import { describe, expect, it } from "vitest";
import {
  countSupportHolders,
  SUPPORT_TITLES,
  supportEndsAt,
  supportTitle,
  supportWindowStart,
} from "./support";

describe("supportTitle (CDC des badges §3)", () => {
  // Aucun don, aucun titre
  it("gives no title without a donation", () => {
    expect(supportTitle(0)).toBeNull();
  });

  // Chaque seuil change de titre au centime près : 10 €, 25 €, 50 € et 100 €
  it("changes title at the exact threshold", () => {
    expect(supportTitle(1)).toBe("supporter");
    expect(supportTitle(999)).toBe("supporter");
    expect(supportTitle(1000)).toBe("regular");
    expect(supportTitle(2499)).toBe("regular");
    expect(supportTitle(2500)).toBe("drivingForce");
    expect(supportTitle(4999)).toBe("drivingForce");
    expect(supportTitle(5000)).toBe("pillar");
    expect(supportTitle(9999)).toBe("pillar");
    expect(supportTitle(10000)).toBe("keystone");
    expect(supportTitle(1_000_000)).toBe("keystone");
  });

  // Les cinq titres du CDC sont atteints, dans l'ordre
  it("reaches the five titles in order", () => {
    expect([1, 1000, 2500, 5000, 10000].map(supportTitle)).toEqual([...SUPPORT_TITLES]);
  });
});

describe("supportEndsAt (CDC des badges §3)", () => {
  // Un don ordinaire : le même jour, un an plus tard, à la même heure
  it("ends 12 calendar months after the last donation", () => {
    expect(supportEndsAt(Date.UTC(2026, 10, 3, 12, 1, 22))).toBe(Date.UTC(2027, 10, 3, 12, 1, 22));
  });

  // Un 29 février n'existe plus l'année suivante : le badge finit le 28
  it("ends on 28 February after a donation on 29 February", () => {
    expect(supportEndsAt(Date.UTC(2028, 1, 29, 10))).toBe(Date.UTC(2029, 1, 28, 10));
  });

  // Un 28 février ne saute pas au 29 d'une année bissextile
  it("keeps 28 February on a leap year", () => {
    expect(supportEndsAt(Date.UTC(2027, 1, 28, 10))).toBe(Date.UTC(2028, 1, 28, 10));
  });

  // Un 31 garde son jour, y compris le 31 décembre à la dernière milliseconde
  it("keeps the 31st", () => {
    expect(supportEndsAt(Date.UTC(2026, 2, 31, 8))).toBe(Date.UTC(2027, 2, 31, 8));
    expect(supportEndsAt(Date.UTC(2026, 11, 31, 23, 59, 59, 999))).toBe(
      Date.UTC(2027, 11, 31, 23, 59, 59, 999),
    );
  });
});

describe("the holders of the Support badge (CDC des badges §4)", () => {
  const now = Date.UTC(2026, 10, 3, 12);

  // Un compte compte tant que son dernier don + 12 mois n'est pas passé, et plus à la seconde où il l'est
  it("counts the accounts whose last donation plus 12 months is still ahead, and only them", () => {
    const lastDonations = [
      Date.UTC(2026, 10, 3, 11), // hier à la même heure ou presque : en cours
      Date.UTC(2025, 10, 3, 12, 0, 1), // la fin tombe dans une seconde : en cours
      Date.UTC(2025, 10, 3, 12), // la fin tombe maintenant : expiré
      Date.UTC(2024, 0, 1), // expiré depuis longtemps
    ];
    expect(countSupportHolders(lastDonations, now)).toBe(2);
    expect(countSupportHolders([], now)).toBe(0);
  });

  // Le début de ce qu'il faut lire ne coupe aucun badge encore en cours, années bissextiles comprises
  it("starts reading early enough to keep every badge still running", () => {
    const day = 24 * 3600 * 1000;
    for (let at = Date.UTC(2027, 0, 1); at < Date.UTC(2029, 0, 1); at += 7 * day)
      for (let age = 0; age <= 400; age++) {
        const donatedAt = at - age * day;
        if (at < supportEndsAt(donatedAt)) expect(donatedAt).toBeGreaterThanOrEqual(supportWindowStart(at));
      }
  });
});

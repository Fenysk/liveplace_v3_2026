import { charityCountdownOf } from "@liveplace/domain/charity-event";
import { describe, expect, it } from "vitest";
import { formatCountdown, fromLocalFields, toLocalDate, toLocalTime } from "./charity-time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const countdownOf = (msLeft: number, locale: "fr" | "en"): string =>
  formatCountdown(charityCountdownOf(msLeft), locale);

describe("charity-time", () => {
  // Les champs sont à l'heure de l'écran : la même date et la même heure donnent le même moment local, quel que soit le fuseau
  it("reads a local date and time as the same local moment", () => {
    expect(fromLocalFields("2026-12-05", "20:30", "start")).toBe(new Date(2026, 11, 5, 20, 30).getTime());
    expect(fromLocalFields("2026-12-05", "20:30", "end")).toBe(new Date(2026, 11, 5, 20, 30).getTime());
  });

  it("writes a moment back as the local text of the date and time fields", () => {
    const moment = new Date(2026, 0, 9, 7, 5).getTime();
    expect(toLocalDate(moment)).toBe("2026-01-09");
    expect(toLocalTime(moment)).toBe("07:05");
    expect(toLocalTime(new Date(2026, 0, 9, 0, 0).getTime())).toBe("00:00");
  });

  it("keeps the texts through a round trip", () => {
    const moment = fromLocalFields("2026-12-05", "20:30", "start") ?? 0;
    expect([toLocalDate(moment), toLocalTime(moment)]).toEqual(["2026-12-05", "20:30"]);
  });

  // Sans heure : un début est ce jour-là à 0 h 00, une fin est le lendemain à 0 h 00 (la fin est exclusive)
  it("starts at 0:00 of that day without a time, and ends at 0:00 of the next day", () => {
    expect(fromLocalFields("2026-12-05", "", "start")).toBe(new Date(2026, 11, 5, 0, 0).getTime());
    expect(fromLocalFields("2026-12-05", "", "end")).toBe(new Date(2026, 11, 6, 0, 0).getTime());
    expect(fromLocalFields("2026-12-31", "", "end")).toBe(new Date(2027, 0, 1, 0, 0).getTime());
  });

  // Une heure sans date ne fait pas de date ; une date cassée non plus
  it("says there is no date for an empty or broken date, even with a time", () => {
    expect(fromLocalFields("", "", "start")).toBeNull();
    expect(fromLocalFields("", "20:30", "end")).toBeNull();
    expect(fromLocalFields("pas une date", "", "start")).toBeNull();
    expect(fromLocalFields("pas une date", "20:30", "end")).toBeNull();
  });

  // Un jour ou plus : jours et heures ; la lettre du jour change avec la langue
  it("counts in days and hours from one day on, with the letter of the language", () => {
    expect(countdownOf(2 * DAY + 5 * HOUR + 59 * MINUTE, "fr")).toBe("2 j 5 h");
    expect(countdownOf(2 * DAY + 5 * HOUR + 59 * MINUTE, "en")).toBe("2 d 5 h");
    expect(countdownOf(DAY, "fr")).toBe("1 j 0 h");
    expect(countdownOf(40 * DAY + 23 * HOUR, "fr")).toBe("40 j 23 h");
  });

  // De une heure à un jour : heures et minutes, les minutes sur 2 chiffres, pareil dans les deux langues
  it("counts in hours and minutes under a day, the minutes on 2 digits, the same in both languages", () => {
    expect(countdownOf(5 * HOUR + 12 * MINUTE, "fr")).toBe("5 h 12 min");
    expect(countdownOf(5 * HOUR + 12 * MINUTE, "en")).toBe("5 h 12 min");
    expect(countdownOf(HOUR, "fr")).toBe("1 h 00 min");
    expect(countdownOf(23 * HOUR + 59 * MINUTE + 59_000, "fr")).toBe("23 h 59 min");
  });

  // Sous une heure : minutes et secondes, les secondes sur 2 chiffres
  it("counts in minutes and seconds under an hour, the seconds on 2 digits", () => {
    expect(countdownOf(12 * MINUTE + 30_000, "fr")).toBe("12 min 30 s");
    expect(countdownOf(12 * MINUTE + 30_000, "en")).toBe("12 min 30 s");
    expect(countdownOf(59 * MINUTE + 59_000, "fr")).toBe("59 min 59 s");
    expect(countdownOf(5_000, "fr")).toBe("0 min 05 s");
    expect(countdownOf(0, "fr")).toBe("0 min 00 s");
  });
});

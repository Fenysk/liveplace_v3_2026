import { HOUR_MS, toActivityPointStarts, toNextDayStart, toPreviousDayStart } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { toDayChoice } from "./day-choice";

const now = Date.UTC(2026, 9, 14, 10, 30); // 12 h 30 à Paris
const todayAt = toActivityPointStarts(now).day;
const yesterdayAt = toPreviousDayStart(todayAt);
const twoDaysAgoAt = toPreviousDayStart(yesterdayAt);
const firstDayAt = toActivityPointStarts(Date.UTC(2026, 8, 1, 12)).day;

describe("the day the developer window shows (JOURNAL 2026-10-14)", () => {
  // Montre aujourd'hui sans jour choisi : « suivant » grisé, « précédent » ouvert vers hier
  it("shows today when no day is chosen: next is off, previous opens on yesterday", () => {
    expect(toDayChoice(undefined, firstDayAt, now)).toEqual({
      label: "Aujourd'hui",
      canGoBack: true,
      canGoForward: false,
      previousAt: yesterdayAt,
      nextAt: undefined,
    });
  });

  // Ramène à aujourd'hui un jour choisi qui l'est devenu (la fenêtre est restée ouverte après minuit)
  it("brings back to today a chosen day that became today", () => {
    expect(toDayChoice(todayAt, firstDayAt, now)).toMatchObject({
      label: "Aujourd'hui",
      canGoForward: false,
    });
    expect(toDayChoice(toNextDayStart(todayAt), firstDayAt, now)).toMatchObject({
      label: "Aujourd'hui",
      canGoForward: false,
    });
  });

  // Hier mène à aujourd'hui avec « suivant », qui revient au direct, sans jour choisi
  it("goes from yesterday to today with next, which returns to the live view with no chosen day", () => {
    expect(toDayChoice(yesterdayAt, firstDayAt, now)).toEqual({
      label: "Hier",
      canGoBack: true,
      canGoForward: true,
      previousAt: twoDaysAgoAt,
      nextAt: undefined,
    });
  });

  // Nomme un jour plus ancien par sa date, et mène au jour d'après avec « suivant »
  it("names an older day by its date, and leads to the day after with next", () => {
    expect(toDayChoice(twoDaysAgoAt, firstDayAt, now)).toEqual({
      label: "lun. 12 oct.",
      canGoBack: true,
      canGoForward: true,
      previousAt: toPreviousDayStart(twoDaysAgoAt),
      nextAt: yesterdayAt,
    });
  });

  // Grise « précédent » sur le plus ancien jour gardé, et tant qu'il est inconnu
  it("turns previous off on the oldest kept day, and while it is unknown", () => {
    expect(toDayChoice(firstDayAt, firstDayAt, now)).toMatchObject({ canGoBack: false, canGoForward: true });
    expect(toDayChoice(undefined, undefined, now)).toMatchObject({ canGoBack: false });
    expect(toDayChoice(twoDaysAgoAt, undefined, now)).toMatchObject({ canGoBack: false, canGoForward: true });
    expect(toDayChoice(toNextDayStart(firstDayAt), firstDayAt, now).canGoBack).toBe(true);
  });

  // Aujourd'hui peut être le plus ancien jour gardé : alors aucune flèche ne mène nulle part
  it("has no arrow to lead anywhere when today is also the oldest kept day", () => {
    expect(toDayChoice(undefined, todayAt, now)).toMatchObject({ canGoBack: false, canGoForward: false });
  });

  // Traverse un jour de 25 heures sans le sauter ni le répéter, dans les deux sens
  it("crosses a day of 25 hours without skipping or repeating it, both ways", () => {
    const inLateOctober = Date.UTC(2026, 9, 27, 10); // le 27/10, après le retour à l'heure d'hiver du 25
    const longDayAt = toActivityPointStarts(Date.UTC(2026, 9, 25, 12)).day;
    const longDayNext = toNextDayStart(longDayAt);

    expect(longDayNext - longDayAt).toBe(25 * HOUR_MS);
    expect(toDayChoice(longDayAt, firstDayAt, inLateOctober)).toMatchObject({
      label: "dim. 25 oct.",
      nextAt: longDayNext,
      previousAt: toActivityPointStarts(Date.UTC(2026, 9, 24, 12)).day,
    });
    expect(toDayChoice(longDayNext, firstDayAt, inLateOctober)).toMatchObject({
      label: "Hier",
      nextAt: undefined,
      previousAt: longDayAt,
    });
  });
});

import { describe, expect, it } from "vitest";
import { fieldsOf, isSettingChanged, refusalOf, settingOf, statusLineOf, withoutSaved } from "./charity-form";
import { CHARITY_TEXTS } from "./charity-texts";

const CHARITY_FR = CHARITY_TEXTS.fr;
const CHARITY_EN = CHARITY_TEXTS.en;

const START = new Date(2026, 11, 5, 20, 0).getTime();
const END = new Date(2026, 11, 6, 20, 0).getTime();
const state = {
  isEnabled: true,
  title: "Live caritatif",
  address: "https://streamlabscharity.com/teams/@x/y",
  startsAt: START,
  endsAt: END,
  donationCount: 3,
} as const;

describe("charity-form", () => {
  it("fills the fields from the state, and prefers what was edited", () => {
    expect(fieldsOf(state, {})).toEqual({
      title: "Live caritatif",
      address: state.address,
      startDate: "2026-12-05",
      startTime: "20:00",
      endDate: "2026-12-06",
      endTime: "20:00",
    });
    expect(fieldsOf(state, { address: "x" }).address).toBe("x");
    expect(fieldsOf(undefined, {})).toEqual({
      title: "",
      address: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
    });
    expect(fieldsOf(state, { title: "Autre" }).title).toBe("Autre");
    expect(fieldsOf({ isEnabled: true, title: "T", donationCount: 0 }, {}).startDate).toBe("");
    expect(fieldsOf({ isEnabled: true, title: "T", donationCount: 0 }, {}).endTime).toBe("");
  });

  it("sends a setting even while the title is empty or a date is missing: the server keeps it as it is", () => {
    expect(settingOf(undefined, { title: "", startDate: "2026-12-05", startTime: "20:00" }, true)).toEqual({
      isEnabled: true,
      title: "",
      address: "",
      startsAt: START,
    });
    expect(settingOf(undefined, { title: "  " }, false)).toEqual({
      isEnabled: false,
      title: "",
      address: "",
    });
    expect(settingOf(state, { startDate: "" }, true)).not.toHaveProperty("startsAt");
    expect(settingOf(state, { endDate: "nope" }, true)).not.toHaveProperty("endsAt");
  });

  it("sends an event without an address: the address is optional", () => {
    const edits = {
      title: "T",
      address: "  ",
      startDate: "2026-12-05",
      startTime: "20:00",
      endDate: "2026-12-06",
      endTime: "20:00",
    };
    expect(settingOf(undefined, edits, true)).toEqual({
      isEnabled: true,
      title: "T",
      address: "",
      startsAt: START,
      endsAt: END,
    });
  });

  it("trims the address and reads the dates as local moments", () => {
    expect(
      settingOf(
        undefined,
        {
          title: "  Live   caritatif ",
          address: " a ",
          startDate: "2026-12-05",
          startTime: "20:00",
          endDate: "2026-12-06",
          endTime: "20:00",
        },
        true,
      ),
    ).toEqual({
      isEnabled: true,
      title: "Live caritatif",
      address: "a",
      startsAt: START,
      endsAt: END,
    });
  });

  it("keeps the saved start to the second when only another field changes, so the event does not start again", () => {
    const withSeconds = { ...state, startsAt: START + 30_000 };
    const setting = settingOf(withSeconds, { title: "Autre" }, true);
    expect(setting).toEqual({ ...withSeconds, isEnabled: true, title: "Autre", donationCount: undefined });
    expect(setting.startsAt).toBe(START + 30_000);
    expect(settingOf(withSeconds, { startTime: "21:00" }, true).startsAt).toBe(
      new Date(2026, 11, 5, 21, 0).getTime(),
    );
  });

  // Une heure vide : le début est à 0 h 00 de ce jour-là, la fin au lendemain 0 h 00
  it("starts at 0:00 without a start time, and ends at 0:00 of the next day without an end time", () => {
    const setting = settingOf(
      undefined,
      { title: "T", startDate: "2026-12-05", endDate: "2026-12-05" },
      true,
    );
    expect(setting.startsAt).toBe(new Date(2026, 11, 5, 0, 0).getTime());
    expect(setting.endsAt).toBe(new Date(2026, 11, 6, 0, 0).getTime());
  });

  // Vider l'heure d'un horodatage enregistré refait la borne depuis la date et le vide
  it("reads an emptied time field as no time, on the saved date", () => {
    expect(settingOf(state, { startTime: "" }, true).startsAt).toBe(new Date(2026, 11, 5, 0, 0).getTime());
    expect(settingOf(state, { endTime: "" }, true).endsAt).toBe(new Date(2026, 11, 7, 0, 0).getTime());
    expect(settingOf(state, { startDate: "2026-12-07" }, true).startsAt).toBe(
      new Date(2026, 11, 7, 20, 0).getTime(),
    );
  });

  // Une heure sans date : pas de date. Vider la date d'une fin enregistrée l'enlève : la fin est facultative
  it("sends no bound for a time without a date, and drops a saved end when its date is emptied", () => {
    expect(settingOf(undefined, { title: "T", startTime: "20:00" }, true)).not.toHaveProperty("startsAt");
    expect(settingOf(state, { endDate: "" }, true)).not.toHaveProperty("endsAt");
    expect(settingOf(state, { endDate: "" }, true).startsAt).toBe(START);
    expect(isSettingChanged(state, settingOf(state, { endDate: "" }, true))).toBe(true);
  });

  // La fin enregistrée au lendemain 0 h 00 se réaffiche comme le lendemain, 00:00
  it("shows a saved end at midnight as that day at 00:00", () => {
    const midnight = { ...state, endsAt: new Date(2026, 11, 7, 0, 0).getTime() };
    expect(fieldsOf(midnight, {})).toMatchObject({ endDate: "2026-12-07", endTime: "00:00" });
  });

  it("sends nothing when nothing changed, and something when a field or the switch did", () => {
    expect(isSettingChanged(state, settingOf(state, {}, true))).toBe(false);
    expect(isSettingChanged(state, settingOf(state, { title: "Autre" }, true))).toBe(true);
    expect(isSettingChanged(state, settingOf(state, {}, false))).toBe(true);
    expect(isSettingChanged(state, settingOf(state, { address: "" }, true))).toBe(true);
    expect(isSettingChanged(undefined, settingOf(undefined, {}, false))).toBe(false);
  });

  it("sends the event-only flag only when it is on, and reads it from the state by default", () => {
    expect(settingOf(state, {}, true)).not.toHaveProperty("isEventOnly");
    expect(settingOf(state, {}, true, true).isEventOnly).toBe(true);
    expect(settingOf({ ...state, isEventOnly: true }, { title: "Autre" }, true).isEventOnly).toBe(true);
    expect(settingOf({ ...state, isEventOnly: true }, {}, true, false)).not.toHaveProperty("isEventOnly");
  });

  it("sends the setting when only the event-only flag changed, either way", () => {
    expect(isSettingChanged(state, settingOf(state, {}, true, true))).toBe(true);
    const only = { ...state, isEventOnly: true };
    expect(isSettingChanged(only, settingOf(only, {}, true))).toBe(false);
    expect(isSettingChanged(only, settingOf(only, {}, true, false))).toBe(true);
  });

  it("forgets what was sent, and keeps what was typed since", () => {
    expect(withoutSaved({ title: "A", address: "x" }, { title: "A" })).toEqual({ address: "x" });
    expect(withoutSaved({ endTime: "21:00", startDate: "2026-12-05" }, { endTime: "21:00" })).toEqual({
      startDate: "2026-12-05",
    });
    expect(withoutSaved({ title: "AB" }, { title: "A" })).toEqual({ title: "AB" });
    expect(withoutSaved({}, { title: "A" })).toEqual({});
  });

  it("names the state line: off, inactive in red, upcoming with its countdown, running and ended with their donations", () => {
    // La typographie française met une espace insécable avant les deux-points : les phrases se comparent avec des espaces simples.
    const line = (status: Parameters<typeof statusLineOf>[0], locale: "fr" | "en" = "fr") => {
      const { text, isDanger } = statusLineOf(status, START, 3, locale, CHARITY_TEXTS[locale]);
      return { text: text.replace(/\s/g, " "), isDanger };
    };
    expect(line({ kind: "off" })).toEqual({ text: "Désactivé", isDanger: false });
    expect(line({ kind: "inactive", reason: "title" })).toEqual({
      text: "Inactif : il manque le titre",
      isDanger: true,
    });
    expect(line({ kind: "inactive", reason: "address" }).text).toBe(
      "Inactif : pas une page Streamlabs Charity",
    );
    expect(line({ kind: "upcoming", startsAt: START + 53 * 3_600_000 })).toEqual({
      text: "À venir · dans 2 j 5 h",
      isDanger: false,
    });
    expect(line({ kind: "running" })).toEqual({ text: "En cours · 3 dons", isDanger: false });
    // Terminé : même accord que « En cours », en gris (jamais en rouge)
    expect(line({ kind: "ended" })).toEqual({ text: "Terminé · 3 dons", isDanger: false });
    expect(line({ kind: "ended" }, "en")).toEqual({ text: "Ended · 3 donations", isDanger: false });
    expect(statusLineOf({ kind: "ended" }, START, 0, "fr", CHARITY_FR).text).toBe("Terminé · 0 don");
    expect(statusLineOf({ kind: "ended" }, START, 1, "en", CHARITY_EN).text).toBe("Ended · 1 donation");
    expect(line({ kind: "inactive", reason: "order" }, "en").text).toBe(
      "Inactive: the end comes before the start",
    );
  });

  it("says a lost connection under the form, and any other refusal in the page language", () => {
    expect(refusalOf("closed", "fr", CHARITY_FR)).toEqual({ text: CHARITY_FR.lost });
    expect(refusalOf("drawing_closed", "en", CHARITY_EN)).toEqual({ text: CHARITY_EN.lost });
    expect(refusalOf("charity_event_unavailable", "fr", CHARITY_FR).text).not.toBe("");
  });
});

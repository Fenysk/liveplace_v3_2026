import { HOUR_MS, MINUTE_MS } from "@liveplace/domain";
import type { ActivityCanvas } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_COLUMNS,
  activeAccountsLabel,
  activePlayersLabel,
  activeStreamersLabel,
  averageVisit,
  connectedPeopleLabel,
  connectedSince,
  formatCount,
  formatDuration,
  guestsNote,
  heatLabel,
  obsViewsLabel,
  PERIOD_OPTIONS,
  peopleLabel,
  phoneShareNote,
  placedPixelsLabel,
  roleLabel,
  signupsLabel,
  slotTitle,
  streamedCanvasesLabel,
  toAudienceRows,
  toCanvasActivityCard,
  toCanvasAudienceRows,
  visitMinutesLabel,
  visitsLabel,
} from "./activity-labels";

const now = Date.UTC(2026, 9, 6, 12, 30); // 14 h 30 à Paris

describe("the words of the activity section (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Écrit les nombres au format français
  it("writes numbers the French way", () => {
    expect(formatCount(1234567)).toBe((1234567).toLocaleString("fr-FR"));
    expect(heatLabel(1500)).toBe(`${(1500).toLocaleString("fr-FR")} px/h`);
  });

  // Accorde au singulier jusqu'à 1, comme en français, et dit les invités parmi les personnes
  it("agrees in the singular up to 1, as in French, and tells the guests among the people", () => {
    expect(peopleLabel(1, 0)).toBe("1 personne");
    expect(peopleLabel(0, 0)).toBe("0 personne");
    expect(peopleLabel(3, 1)).toBe("3 personnes, dont 1 invité");
    expect(peopleLabel(5, 2)).toBe("5 personnes, dont 2 invités");
    expect(guestsNote(0)).toBe("aucun invité");
    expect(signupsLabel(1)).toBe("1 nouveau compte");
    expect(signupsLabel(4)).toBe("4 nouveaux comptes");
  });

  // Dit depuis quand un compte est là, en minutes, puis en heures, puis en jours
  it("tells since when an account is there, in minutes, then hours, then days", () => {
    expect(connectedSince(now - 20_000, now)).toBe("depuis moins d'une minute");
    expect(connectedSince(now - 12 * MINUTE_MS, now)).toBe("depuis 12 min");
    expect(connectedSince(now - HOUR_MS - 5 * MINUTE_MS, now)).toBe("depuis 1 h 05");
    expect(connectedSince(now - 50 * HOUR_MS, now)).toBe("depuis 2 jours");
    expect(connectedSince(now + 3000, now)).toBe("depuis moins d'une minute");
  });

  // Nomme les rôles d'un canvas, et les trois périodes de l'historique
  it("names the roles of a canvas, and the three periods of the history", () => {
    expect(roleLabel("owner")).toBe("Streamer");
    expect(roleLabel("moderator")).toBe("Modérateur");
    expect(roleLabel("viewer")).toBe("Viewer");
    expect(PERIOD_OPTIONS.map(({ value, label }) => `${value}:${label}`)).toEqual([
      "day:24 h",
      "month:30 jours",
      "all:Tout",
    ]);
  });

  // Date un point à l'heure de Paris : sa minute ou son heure, ou son jour seul pour Tout
  it("dates a point in Paris time: its minute or hour, or its day alone for All", () => {
    expect(slotTitle(now, "day")).toContain("14:30");
    expect(slotTitle(now, "month")).toContain("6 oct.");
    expect(slotTitle(now, "all")).toContain("2026");
    expect(slotTitle(now, "all")).not.toContain("14:30");
  });

  // Montre d'un canvas son streamer, sa pastille OBS, ses chiffres, et ses comptes avec leur rôle et leur appareil
  it("shows a canvas's owner, its OBS badge, its numbers, and its accounts with their role and device", () => {
    const canvas: ActivityCanvas = {
      canvasId: "c1",
      owner: { userId: "1", login: "kalyss", displayName: "Kalyss" },
      obsViews: 2,
      people: 3,
      guests: 1,
      heat: 120,
      signups: 1,
      accounts: [
        {
          userId: "2",
          login: "moth",
          displayName: "Moth",
          role: "moderator",
          connectedAt: now - 12 * MINUTE_MS,
          devices: ["desktop", "phone"],
        },
      ],
    };

    expect(toCanvasActivityCard(canvas, now)).toEqual({
      owner: canvas.owner,
      obsTitle: "2 vues OBS ouvertes",
      facts: ["3 personnes, dont 1 invité", "120 px/h", "1 nouveau compte"],
      accounts: [
        { user: canvas.accounts[0], mention: "Modérateur · depuis 12 min", devices: ["desktop", "phone"] },
      ],
      guestsLine: "+ 1 invité",
    });
    expect(toCanvasActivityCard({ ...canvas, obsViews: 0, guests: 0 }, now)).toMatchObject({
      obsTitle: null,
      guestsLine: null,
    });
  });

  // Dans l'infobulle des courbes, accorde chaque valeur en minuscules, comme les lignes des canvas
  it("agrees each value of the curves' tooltip in lowercase, as the canvas rows do", () => {
    expect([connectedPeopleLabel(1), connectedPeopleLabel(2)]).toEqual([
      "1 personne connectée",
      "2 personnes connectées",
    ]);
    expect([streamedCanvasesLabel(0), streamedCanvasesLabel(2)]).toEqual([
      "0 canvas streamé",
      "2 canvas streamés",
    ]);
    expect([placedPixelsLabel(1), placedPixelsLabel(3)]).toEqual(["1 pixel posé", "3 pixels posés"]);
    expect([signupsLabel(0), signupsLabel(2)]).toEqual(["0 nouveau compte", "2 nouveaux comptes"]);
    expect(placedPixelsLabel(1500)).toBe(`${(1500).toLocaleString("fr-FR")} pixels posés`);
  });
});

describe("the words of the audience (JOURNAL 2026-10-07)", () => {
  // Accorde les visites, les minutes et les comptes, joueurs et streamers actifs, au singulier jusqu'à 1
  it("agrees the visits, the minutes and the active accounts, players and streamers, in the singular up to 1", () => {
    expect([visitsLabel(0), visitsLabel(1), visitsLabel(12)]).toEqual(["0 visite", "1 visite", "12 visites"]);
    expect([visitMinutesLabel(1), visitMinutesLabel(80)]).toEqual(["1 minute", "80 minutes"]);
    expect([activeAccountsLabel(1), activeAccountsLabel(2)]).toEqual(["1 compte actif", "2 comptes actifs"]);
    expect([activePlayersLabel(1), activePlayersLabel(3)]).toEqual(["1 joueur actif", "3 joueurs actifs"]);
    expect([activeStreamersLabel(0), activeStreamersLabel(4)]).toEqual([
      "0 streamer actif",
      "4 streamers actifs",
    ]);
    expect(visitsLabel(1500)).toBe(`${(1500).toLocaleString("fr-FR")} visites`);
  });

  // Écrit un temps passé en heures et minutes, les minutes sur deux chiffres après les heures
  it("writes a time spent in hours and minutes, the minutes on two digits after the hours", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h 00 min");
    expect(formatDuration(200)).toBe("3 h 20 min");
    expect(formatDuration(5461)).toBe(`${(91).toLocaleString("fr-FR")} h 01 min`);
    expect(formatDuration(1_500_000)).toBe(`${(25_000).toLocaleString("fr-FR")} h 00 min`);
  });

  // Écrit la durée moyenne d'une visite en minutes et secondes, un tiret sans visite
  it("writes the average length of a visit in minutes and seconds, a dash with no visit", () => {
    expect(averageVisit(9, 2)).toBe("4 min 30 s");
    expect(averageVisit(1, 1)).toBe("1 min 00 s");
    expect(averageVisit(1, 60)).toBe("1 s");
    expect(averageVisit(0, 5)).toBe("0 s");
    expect(averageVisit(130, 2)).toBe("1 h 05 min");
    expect(averageVisit(10, 0)).toBe("—");
    expect(averageVisit(0, 0)).toBe("—");
  });

  // Dit la part des visites faites au téléphone, arrondie, et rien sans visite
  it("says the share of the visits made on a phone, rounded, and nothing with no visit", () => {
    expect(phoneShareNote(5, 10)).toBe("dont 50 % au téléphone");
    expect(phoneShareNote(1, 3)).toBe("dont 33 % au téléphone");
    expect(phoneShareNote(2, 3)).toBe("dont 67 % au téléphone");
    expect(phoneShareNote(0, 4)).toBe("dont 0 % au téléphone");
    expect(phoneShareNote(0, 0)).toBeUndefined();
  });

  // Met l'audience en lignes, un chiffre par ligne, aujourd'hui puis les 30 jours
  it("lays the audience out in rows, one figure per row, today then the 30 days", () => {
    const today = {
      visits: 38,
      phoneVisits: 19,
      visitMinutes: 200,
      activeAccounts: 14,
      activePlayers: 9,
      activeStreamers: 3,
    };
    const month = {
      visits: 1214,
      phoneVisits: 497,
      visitMinutes: 5461,
      activeAccounts: 212,
      activePlayers: 131,
      activeStreamers: 11,
    };

    expect(AUDIENCE_COLUMNS).toEqual(["Aujourd'hui", "30 jours"]);
    expect(toAudienceRows({ today, month })).toEqual([
      {
        label: "Visites",
        cells: [
          { value: "38", note: "dont 50 % au téléphone" },
          { value: formatCount(1214), note: "dont 41 % au téléphone" },
        ],
      },
      { label: "Temps passé", cells: [{ value: "3 h 20 min" }, { value: "91 h 01 min" }] },
      { label: "Durée moyenne d'une visite", cells: [{ value: "5 min 16 s" }, { value: "4 min 30 s" }] },
      { label: "Comptes actifs", cells: [{ value: "14" }, { value: "212" }] },
      { label: "Joueurs actifs", cells: [{ value: "9" }, { value: "131" }] },
      { label: "Streamers actifs", cells: [{ value: "3" }, { value: "11" }] },
    ]);
  });

  // Sans visite, ne dit ni part au téléphone ni durée moyenne : un tiret, jamais zéro inventé
  it("with no visit, says no phone share and no average: a dash, never an invented zero", () => {
    const none = {
      visits: 0,
      phoneVisits: 0,
      visitMinutes: 0,
      activeAccounts: 0,
      activePlayers: 0,
      activeStreamers: 0,
    };

    const [visits, , average] = toAudienceRows({ today: none, month: none });

    expect(visits?.cells).toEqual([{ value: "0" }, { value: "0" }]);
    expect(average?.cells).toEqual([{ value: "—" }, { value: "—" }]);
  });
});

describe("the words of the canvas section (JOURNAL 2026-10-07)", () => {
  const today = { visits: 38, phoneVisits: 19, visitMinutes: 200, activePlayers: 9, signups: 2 };
  const month = { visits: 1214, phoneVisits: 497, visitMinutes: 5461, activePlayers: 131, signups: 40 };

  // Accorde les vues OBS ouvertes, au singulier jusqu'à 1
  it("agrees the open OBS views, in the singular up to 1", () => {
    expect([obsViewsLabel(0), obsViewsLabel(1), obsViewsLabel(2)]).toEqual([
      "0 vue OBS ouverte",
      "1 vue OBS ouverte",
      "2 vues OBS ouvertes",
    ]);
  });

  // Met l'audience d'un canvas dans les mêmes lignes que celle de tout LivePlace, avec ses joueurs actifs et les nouveaux comptes venus de sa page à la fin
  it("lays the audience of a canvas out in the same rows as the whole one, its active players and the signups from its page at the end", () => {
    expect(toCanvasAudienceRows({ today, month })).toEqual([
      {
        label: "Visites",
        cells: [
          { value: "38", note: "dont 50 % au téléphone" },
          { value: formatCount(1214), note: "dont 41 % au téléphone" },
        ],
      },
      { label: "Temps passé", cells: [{ value: "3 h 20 min" }, { value: "91 h 01 min" }] },
      { label: "Durée moyenne d'une visite", cells: [{ value: "5 min 16 s" }, { value: "4 min 30 s" }] },
      { label: "Joueurs actifs", cells: [{ value: "9" }, { value: "131" }] },
      { label: "Nouveaux comptes venus de sa page", cells: [{ value: "2" }, { value: "40" }] },
    ]);
  });

  // Sans visite sur ce canvas, ne dit ni part au téléphone ni durée moyenne : un tiret
  it("with no visit on the canvas, says no phone share and no average: a dash", () => {
    const none = { visits: 0, phoneVisits: 0, visitMinutes: 0, activePlayers: 0, signups: 0 };

    const [visits, , average] = toCanvasAudienceRows({ today: none, month: none });

    expect(visits?.cells).toEqual([{ value: "0" }, { value: "0" }]);
    expect(average?.cells).toEqual([{ value: "—" }, { value: "—" }]);
  });
});

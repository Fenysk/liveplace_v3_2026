import { HOUR_MS, MINUTE_MS } from "@liveplace/domain";
import type { ActivityCanvas } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  connectedPeopleLabel,
  connectedSince,
  formatCount,
  guestsNote,
  heatLabel,
  PERIOD_OPTIONS,
  peopleLabel,
  placedPixelsLabel,
  roleLabel,
  signupsLabel,
  slotTitle,
  streamedCanvasesLabel,
  toCanvasActivityCard,
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

import { describe, expect, it } from "vitest";
import { badgeLabel, badgeLabels } from "./user-badge-label";

describe("badgeLabel (CDC des badges §3)", () => {
  // Soutien dit son titre derrière « Soutien », le premier palier seul : « Soutien »
  it("says the Support title after Support, and Support alone at the first tier", () => {
    expect(badgeLabel("support.supporter", "fr")).toBe("Soutien");
    expect(badgeLabel("support.regular", "fr")).toBe("Soutien · Fidèle");
    expect(badgeLabel("support.drivingForce", "fr")).toBe("Soutien · Moteur");
    expect(badgeLabel("support.pillar", "fr")).toBe("Soutien · Pilier");
    expect(badgeLabel("support.keystone", "fr")).toBe("Soutien · Clé de voûte");
  });

  // En anglais, les titres du CDC : Supporter, Regular, Driving Force, Pillar, Keystone
  it("says the English titles", () => {
    expect(badgeLabel("support.supporter", "en")).toBe("Supporter");
    expect(badgeLabel("support.regular", "en")).toBe("Supporter · Regular");
    expect(badgeLabel("support.drivingForce", "en")).toBe("Supporter · Driving Force");
    expect(badgeLabel("support.pillar", "en")).toBe("Supporter · Pillar");
    expect(badgeLabel("support.keystone", "en")).toBe("Supporter · Keystone");
  });

  // Modérateur dit ce qu'il fait, dans les deux langues
  it("says what a moderator does", () => {
    expect(badgeLabel("moderator", "fr")).toBe("Modère cette fresque");
    expect(badgeLabel("moderator", "en")).toBe("Moderates this canvas");
  });

  // Aucun montant, nulle part : un chiffre ou un signe monétaire dans un texte serait un montant
  it("never states an amount", () => {
    for (const id of ["moderator", "support.supporter", "support.keystone"] as const)
      for (const locale of ["fr", "en"] as const) expect(badgeLabel(id, locale)).not.toMatch(/[0-9€$]/);
  });

  // Un id inconnu est ignoré, le reste suit l'ordre du catalogue
  it("lists the labels in catalogue order and skips an unknown id", () => {
    expect(badgeLabels(["support.pillar", "pixels.2", "moderator"], "fr")).toEqual([
      "Modère cette fresque",
      "Soutien · Pilier",
    ]);
    expect(badgeLabels(undefined, "fr")).toEqual([]);
  });
});

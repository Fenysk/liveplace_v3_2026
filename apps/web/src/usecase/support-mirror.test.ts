import { describe, expect, it } from "vitest";
import { toSupportMirror } from "./support-mirror";

const donated = Date.UTC(2026, 9, 15, 10);

describe("toSupportMirror (JOURNAL 2026-11-03)", () => {
  // Quand aucun don n'est relié au compte, le miroir n'a rien à garder
  it("has nothing for an account without a linked donation", () => {
    expect(toSupportMirror(null)).toBeNull();
  });

  // Le titre suit le cumul à vie, la fin est le dernier don + 12 mois
  it("takes the title from the lifetime total and the end from the last donation", () => {
    expect(toSupportMirror({ lifetimeCents: 1, lastDonatedAt: donated })).toEqual({
      title: "supporter",
      endsAt: Date.UTC(2027, 9, 15, 10),
    });
    expect(toSupportMirror({ lifetimeCents: 10_000, lastDonatedAt: donated })?.title).toBe("keystone");
  });

  // Un cumul vide (aucun centime) ne donne pas de badge
  it("gives no badge for a total of zero", () => {
    expect(toSupportMirror({ lifetimeCents: 0, lastDonatedAt: donated })).toBeNull();
  });
});

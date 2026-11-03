import { describe, expect, it } from "vitest";
import { normalizeEmail, soleAccountOf } from "./donation-link";

describe("normalizeEmail (CDC des badges §3)", () => {
  // Minuscules et sans espaces autour : c'est ainsi que Ko-fi et Twitch se comparent
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Alexis.Fenysk@Example.COM \n")).toBe("alexis.fenysk@example.com");
  });

  // Absent ou vide : pas d'e-mail du tout
  it("gives nothing for a missing or blank address", () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail("")).toBeUndefined();
    expect(normalizeEmail("   ")).toBeUndefined();
  });
});

describe("soleAccountOf (CDC des badges §3)", () => {
  // Aucun compte ne porte l'e-mail : le don attend
  it("gives nothing for zero accounts", () => {
    expect(soleAccountOf([])).toBeUndefined();
  });

  // Un seul compte : c'est lui
  it("gives the account when exactly one carries the address", () => {
    expect(soleAccountOf(["1234"])).toBe("1234");
  });

  // Deux comptes sur un même e-mail : le développeur choisira
  it("gives nothing for two accounts", () => {
    expect(soleAccountOf(["1234", "5678"])).toBeUndefined();
  });
});

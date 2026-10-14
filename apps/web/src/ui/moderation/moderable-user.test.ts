import { describe, expect, it } from "vitest";
import { moderableUserId } from "./moderable-user";

// Le streamer (`owner-1`) et soi-même (`me`) ne se modèrent jamais.
const moderation = { isProtected: (userId: string) => userId === "owner-1" || userId === "me" };

describe("les actions de modération d'une pose (Écart §8.1, JOURNAL 2026-10-12)", () => {
  // La pose d'un autre compte : son auteur se modère
  it("gives the author of a pose placed by another account", () => {
    expect(moderableUserId(moderation, { userId: "viewer-1" })).toBe("viewer-1");
  });

  // Jamais les poses du streamer ni les siennes
  it("gives nobody for the owner's poses or one's own", () => {
    expect(moderableUserId(moderation, { userId: "owner-1" })).toBeUndefined();
    expect(moderableUserId(moderation, { userId: "me" })).toBeUndefined();
  });

  // §4.3 : une pose sans identifiant ne se modère pas
  it("gives nobody for a pose without an identifier", () => {
    expect(moderableUserId(moderation, {})).toBeUndefined();
    expect(moderableUserId(moderation, { userId: "" })).toBeUndefined();
  });
});

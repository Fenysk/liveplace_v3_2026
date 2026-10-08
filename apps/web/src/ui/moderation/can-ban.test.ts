import { describe, expect, it } from "vitest";
import { canBan } from "./can-ban";
import type { ModerationTarget } from "./moderation-window";
import { askBanAfterClear } from "./use-moderation";

const namedHere = { isFromTwitch: false, isNamedHere: true };
const fromTwitch = { isFromTwitch: true, isNamedHere: false };
const both = { isFromTwitch: true, isNamedHere: true };

const author = (moderatorOrigin?: ModerationTarget["moderatorOrigin"]): ModerationTarget => ({
  userId: "3",
  displayName: "Troll42",
  placementId: "pdemo0001",
  ...(moderatorOrigin ? { moderatorOrigin } : {}),
});

describe("canBan (Écart §5.4, JOURNAL 2026-10-08)", () => {
  // Un modérateur nommé ici ne se bannit pas, même s'il l'est aussi sur Twitch ; celui de Twitch seul et un simple joueur, si
  it("refuses a moderator named here, even when Twitch names him too, and allows a Twitch-only moderator and a player", () => {
    expect(canBan(author(namedHere))).toBe(false);
    expect(canBan(author(both))).toBe(false);
    expect(canBan(author(fromTwitch))).toBe(true);
    expect(canBan(author())).toBe(true);
  });
});

describe("the ban offered after a clear (Écart §5.4, JOURNAL 2026-10-08)", () => {
  // Un retrait fait propose de bannir son auteur, sauf un modérateur nommé ici : le retrait suffit
  it("is offered to the author of a clear, except a moderator named here", () => {
    expect(askBanAfterClear({ kind: "clear", author: author() })).toEqual({
      kind: "banAfterClear",
      author: author(),
    });
    expect(askBanAfterClear({ kind: "clear", author: author(fromTwitch) })?.kind).toBe("banAfterClear");
    expect(askBanAfterClear({ kind: "clear", author: author(namedHere) })).toBeNull();
    expect(askBanAfterClear({ kind: "clear", author: author(both) })).toBeNull();
  });

  // Rien ne suit un ban, ni la question elle-même
  it("follows neither a ban nor the question itself", () => {
    expect(askBanAfterClear({ kind: "ban", author: author() })).toBeNull();
    expect(askBanAfterClear({ kind: "banAfterClear", author: author() })).toBeNull();
  });
});

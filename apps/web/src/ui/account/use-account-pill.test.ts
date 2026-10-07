import { describe, expect, it } from "vitest";
import { toIdentity } from "./use-account-pill";

describe("toIdentity (pill Compte, fenêtre Mon compte)", () => {
  const signedIn = { role: "viewer", userId: "user-1", login: "user1", displayName: "User 1" } as const;

  // Avant la réponse du gateway, personne n'est connu ; sans compte, c'est un invité
  it("knows nobody before the gateway answers, and a guest without an account", () => {
    expect(toIdentity({})).toEqual({ kind: "unknown" });
    expect(toIdentity({ role: "guest" })).toEqual({ kind: "guest" });
  });

  // Écart §4 (JOURNAL 2026-10-07) : son profil porte son live Twitch quand le gateway le dit, la fenêtre Mon compte aussi
  it("carries the person's Twitch live in the profile when the gateway says it", () => {
    const live = toIdentity({ ...signedIn, twitchLive: { category: "Art" } });
    const notLive = toIdentity(signedIn);

    expect(live).toEqual({
      kind: "signedIn",
      user: { displayName: "User 1", login: "user1", avatarUrl: undefined, twitchLive: { category: "Art" } },
    });
    expect(notLive.kind === "signedIn" && notLive.user.twitchLive).toBeUndefined();
  });
});

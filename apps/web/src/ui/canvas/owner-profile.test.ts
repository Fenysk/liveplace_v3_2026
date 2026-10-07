import { describe, expect, it } from "vitest";
import type { ProfileUser } from "../design/profile";
import { toOwnerProfile } from "./owner-profile";

const art = { category: "Art" };
const chatting = { category: "Just Chatting" };
const rendered: ProfileUser = {
  displayName: "Kalyss",
  login: "kalyss",
  avatarUrl: "https://photo",
  twitchLive: art,
};

describe("the owner's profile, with its live (Écart §4, JOURNAL 2026-10-07)", () => {
  // Avant le welcome, le live lu par le serveur au rendu fait foi
  it("keeps the live the server read when rendering, until the welcome", () => {
    expect(toOwnerProfile(rendered, {})).toEqual(rendered);
    expect(toOwnerProfile({ ...rendered, twitchLive: undefined }, {})).not.toHaveProperty("twitchLive");
  });

  // Après le welcome, le live du gateway remplace celui du rendu, et le suit à chaque changement
  it("takes the gateway's live over the rendered one after the welcome", () => {
    expect(toOwnerProfile(rendered, { ownerId: "owner-1", ownerTwitchLive: chatting })).toEqual({
      ...rendered,
      twitchLive: chatting,
    });
  });

  // Après le welcome, un streamer hors live n'est plus en live, même si le rendu l'avait dit : le live du rendu a pu vieillir
  it("drops a rendered live that the gateway does not confirm", () => {
    const profile = toOwnerProfile(rendered, { ownerId: "owner-1" });

    expect(profile).not.toHaveProperty("twitchLive");
    expect(profile).toMatchObject({ displayName: "Kalyss", login: "kalyss", avatarUrl: "https://photo" });
  });
});

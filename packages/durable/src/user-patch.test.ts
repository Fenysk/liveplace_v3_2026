import { describe, expect, it } from "vitest";
import { toUserPatch } from "./user-patch";

const signedIn = { login: "fenysk", displayName: "Fenysk", avatarUrl: "https://avatar" };

describe("what a sign-in changes in the row of a known account (§8.1, Twitch contract VI.F)", () => {
  // Un jeton qui porte l'e-mail : il remplace celui d'avant, avec le profil et l'heure de la connexion
  it("takes the email of the token, with the profile and the time of the sign-in", () => {
    expect(toUserPatch({ ...signedIn, email: "fenysk@example.com" }, 1234)).toEqual({
      ...signedIn,
      email: "fenysk@example.com",
      lastSignInAt: 1234,
    });
  });

  // Un jeton qui n'a plus le droit `user:read:email` : l'e-mail gardé part. `db.patch` retire un champ mis à `undefined`.
  it("carries an explicit undefined email when the token has none, so Convex erases the one it kept", () => {
    const patch = toUserPatch(signedIn, 1234);

    expect("email" in patch).toBe(true);
    expect(patch.email).toBeUndefined();
    expect(patch).toEqual({ ...signedIn, email: undefined, lastSignInAt: 1234 });
  });

  // Le profil change d'une connexion à l'autre (un nouveau pseudo, une nouvelle photo) : il suit
  it("follows a profile that changed between two sign-ins", () => {
    const renamed = { login: "kalyss", displayName: "Kalyss", avatarUrl: "https://other" };

    expect(toUserPatch({ ...renamed, email: "a@example.com" }, 5)).toMatchObject(renamed);
  });
});

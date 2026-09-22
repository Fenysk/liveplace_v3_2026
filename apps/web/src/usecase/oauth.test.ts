import { describe, expect, it } from "vitest";
import { parseOAuthCookie, toOAuthCookieValue, toReturnPath } from "./oauth";

describe("toReturnPath (Écart §10.1)", () => {
  // Accepte le chemin d'un canvas, en minuscules comme les pseudos Twitch
  it("accepts a canvas path, lowercased like Twitch logins", () => {
    expect(toReturnPath("/fenysk")).toBe("/fenysk");
    expect(toReturnPath("/ws_gaming")).toBe("/ws_gaming");
    expect(toReturnPath("/Fenysk")).toBe("/fenysk");
  });

  // Refuse tout ce qui mènerait ailleurs : une redirection ouverte
  it("refuses anything that would lead elsewhere: an open redirect", () => {
    for (const candidate of [
      "//evil.com",
      "https://evil.com",
      "/../x",
      "/a/b",
      "/fenysk/",
      "/fenysk?x=1",
      "fenysk",
      "/",
      "",
    ]) {
      expect(toReturnPath(candidate)).toBeNull();
    }
    expect(toReturnPath(null)).toBeNull();
    expect(toReturnPath(undefined)).toBeNull();
  });
});

describe("OAuth cookie (§10.1)", () => {
  // Retrouve le state et le chemin de retour posés à l'aller
  it("gives back the state and return path set on the way out", () => {
    const pending = { state: "state-1", returnPath: "/fenysk" };
    expect(parseOAuthCookie(toOAuthCookieValue(pending))).toEqual(pending);
  });

  // Garde le state quand il n'y a pas de chemin de retour
  it("keeps the state when there is no return path", () => {
    const pending = { state: "state-1", returnPath: null };
    expect(parseOAuthCookie(toOAuthCookieValue(pending))).toEqual(pending);
  });

  // Revalide le chemin au retour : un cookie trafiqué ne mène pas ailleurs
  it("validates the path again on the way back: a forged cookie leads nowhere else", () => {
    expect(parseOAuthCookie("state-1|//evil.com")).toEqual({ state: "state-1", returnPath: null });
  });

  // Rend null sans cookie ou sans state
  it("gives null without a cookie or without a state", () => {
    expect(parseOAuthCookie(undefined)).toBeNull();
    expect(parseOAuthCookie("|/fenysk")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { cookieValue, serializeCookie } from "./index";

describe("cookieValue", () => {
  // Retrouve la valeur d'un cookie parmi les autres
  it("finds a cookie among the others", () => {
    expect(cookieValue("other=1; lp_session=abc.def; last=2", "lp_session")).toBe("abc.def");
  });

  // Ne confond pas deux cookies dont les noms se ressemblent
  it("does not confuse two cookies with similar names", () => {
    expect(cookieValue("xlp_session=1", "lp_session")).toBeUndefined();
  });

  // Rend undefined sans en-tête ou sans ce cookie
  it("gives undefined without a header or without that cookie", () => {
    expect(cookieValue(undefined, "lp_session")).toBeUndefined();
    expect(cookieValue("other=1", "lp_session")).toBeUndefined();
  });
});

describe("serializeCookie", () => {
  // Pose un cookie HttpOnly, SameSite=Lax, valable sur tout le site
  it("sets an HttpOnly, SameSite=Lax cookie for the whole site", () => {
    expect(serializeCookie("lp_session", "abc", 60, false)).toBe(
      "lp_session=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Lax",
    );
  });

  // Ajoute Secure quand le site est servi en HTTPS
  it("adds Secure when the site is served over HTTPS", () => {
    expect(serializeCookie("lp_session", "abc", 60, true)).toContain("; Secure");
  });

  // Efface un cookie avec une durée nulle
  it("clears a cookie with a zero max age", () => {
    expect(serializeCookie("lp_session", "", 0, true)).toMatch(/^lp_session=; Path=\/; Max-Age=0;/);
  });
});

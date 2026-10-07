import { describe, expect, it } from "vitest";
import { cookieValue, fromBase64, serializeCookie, toBase64 } from "./index";

describe("toBase64 and fromBase64 (Écart §15, JOURNAL 2026-10-06)", () => {
  // Écrit les octets en base64, comme tout le monde le fait
  it("writes bytes in base64, as everyone does", () => {
    expect(toBase64(Uint8Array.from([104, 105]))).toBe("aGk=");
    expect(toBase64(new Uint8Array(0))).toBe("");
    expect(toBase64(Uint8Array.from([255, 254, 253]))).toBe("//79");
  });

  // Rend les mêmes octets, sur tous les octets possibles
  it("gives the same bytes back, over every possible byte", () => {
    const every = Uint8Array.from({ length: 256 }, (_, byte) => byte);

    expect(fromBase64(toBase64(every))).toEqual(every);
    expect(fromBase64("")).toEqual(new Uint8Array(0));
  });

  // Tient sur un grand canvas : 256 × 256 octets, sans faire déborder la pile
  it("holds on a large canvas: 256 × 256 bytes, without overflowing the stack", () => {
    const large = Uint8Array.from({ length: 256 * 256 }, (_, index) => index % 251);

    expect(fromBase64(toBase64(large))).toEqual(large);
  });
});

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

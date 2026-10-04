import { describe, expect, it } from "vitest";
import { routeIdOf } from "./route-id";
import { policyFor } from "./security-headers";

describe("routeIdOf", () => {
  // La route servie se lit dans l'arbre des routes, jamais dans une expression du chemin
  it("reads the served route from the route tree", () => {
    expect(routeIdOf("/fenysk")).toBe("/$login");
    expect(routeIdOf("/fenysk/")).toBe("/$login");
    expect(routeIdOf("/fenysk/obs")).toBe("/$login_/obs");
    expect(routeIdOf("/confidentialite")).toBe("/confidentialite");
    expect(routeIdOf("/")).toBe("/");
    expect(routeIdOf("/a/b/c/d")).toBeUndefined();
  });

  // Quand une page est servie, elle apporte sa CSP : celle de Google pour `/{login}` seulement
  it("gives Google's policy to /{login} and the strict one to every other page", () => {
    expect(policyFor(routeIdOf("/fenysk"))).toBe("adsense");
    for (const path of ["/", "/confidentialite", "/ads.txt", "/fenysk/obs", "/nimporte/quoi/d/autre"])
      expect(policyFor(routeIdOf(path))).toBe("strict");
  });
});

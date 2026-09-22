import { describe, expect, it } from "vitest";
import { isServiceKeyValid } from "./service-key";

const serviceKey = "k".repeat(32);

describe("isServiceKeyValid (§8.2, règle 4)", () => {
  // Refuse tout quand la clé du déploiement est absente : le défaut est fermé
  it("refuses everything when the deployment key is missing", () => {
    expect(isServiceKeyValid(undefined, serviceKey)).toBe(false);
    expect(isServiceKeyValid(undefined, "")).toBe(false);
  });

  // Refuse tout quand la clé du déploiement est vide
  it("refuses everything when the deployment key is empty", () => {
    expect(isServiceKeyValid("", "")).toBe(false);
  });

  // Refuse une clé différente, de même longueur ou non
  it("refuses a different key, same length or not", () => {
    expect(isServiceKeyValid(serviceKey, "x".repeat(32))).toBe(false);
    expect(isServiceKeyValid(serviceKey, serviceKey.slice(1))).toBe(false);
    expect(isServiceKeyValid(serviceKey, `${serviceKey}k`)).toBe(false);
  });

  // Accepte la bonne clé
  it("accepts the right key", () => {
    expect(isServiceKeyValid(serviceKey, serviceKey)).toBe(true);
  });
});

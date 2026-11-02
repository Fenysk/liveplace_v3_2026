import { describe, expect, it } from "vitest";
import { createAccountsFilter, mayNameAccount } from "./accounts-filter";

const accountsOf = (count: number, prefix: string): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${100_000_000 + index * 7}`);

describe("the filter of the accounts a file names (CDC §8, Supprimer son compte)", () => {
  // Jamais de faux négatif : un compte nommé est toujours trouvé, de 0 à plus de comptes que le filtre ne peut en tenir
  it("always finds an account that was put in, from a few to more than it can hold", () => {
    for (const count of [1, 12, 500, 4_000, 15_000]) {
      const accounts = accountsOf(count, "in");
      const filter = createAccountsFilter(accounts);

      expect(accounts.every((userId) => mayNameAccount(filter, userId))).toBe(true);
    }
  });

  // Quelques faux positifs, au plus : un fichier lu pour rien, pas une erreur
  it("rarely says maybe for an account that was not put in", () => {
    const filter = createAccountsFilter(accountsOf(1_000, "in"));

    const strangers = accountsOf(5_000, "out").filter((userId) => mayNameAccount(filter, userId));

    expect(strangers.length / 5_000).toBeLessThan(0.02);
  });

  // Un fichier sans compte nomme personne
  it("names nobody when no account was put in", () => {
    const filter = createAccountsFilter([]);

    expect(accountsOf(200, "out").some((userId) => mayNameAccount(filter, userId))).toBe(false);
  });

  // Le filtre tient en quelques centaines d'octets pour un fichier courant, et ne dépasse jamais 16 Kio
  it("stays small for an ordinary file and never beyond 16 KiB", () => {
    const small = createAccountsFilter(accountsOf(40, "in"));
    const huge = createAccountsFilter(accountsOf(15_000, "in"));

    expect(atob(small).length).toBeLessThan(100);
    expect(atob(huge).length).toBe(16 * 1024);
  });

  // Le filtre ne garde rien de lisible : ni l'identifiant, ni une partie
  it("keeps nothing readable of the account", () => {
    const filter = createAccountsFilter(["68710381"]);

    expect(filter).not.toContain("68710381");
    expect(atob(filter)).not.toContain("6871");
  });

  // Un filtre illisible ne prouve rien : le fichier est lu
  it("says maybe for a filter it cannot read", () => {
    expect(mayNameAccount("", "someone")).toBe(true);
    expect(mayNameAccount("%%pas du base64%%", "someone")).toBe(true);
  });
});

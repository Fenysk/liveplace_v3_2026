// Les dons jamais reliés et les preuves d'effacement qui ont fait leur temps (JOURNAL 2026-11-04), tels que `convex/expiry.ts` les
// efface, sur un faux `db` qui ne sait que ce qu'ils lui demandent.

import { deletionProofCutoff, unlinkedDonationCutoff } from "@liveplace/domain/retention";
import { describe, expect, it } from "vitest";
import { purgeDeletionProofs, purgeUnlinkedDonations } from "../convex/expiry";

type Row = { _id: string; [field: string]: unknown };

const createFakeDb = () => {
  const tables = new Map<string, Row[]>();
  let counter = 0;
  const rowsOf = (table: string): Row[] => {
    const rows = tables.get(table) ?? [];
    tables.set(table, rows);
    return rows;
  };
  const db = {
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build: (range: {
          eq: (field: string, value: unknown) => unknown;
          lt: (field: string, value: number) => unknown;
        }) => unknown,
      ) => {
        const conditions: [string, unknown][] = [];
        const upperBounds: [string, number][] = [];
        const range = {
          eq: (field: string, value: unknown) => {
            conditions.push([field, value]);
            return range;
          },
          lt: (field: string, value: number) => {
            upperBounds.push([field, value]);
            return range;
          },
        };
        build(range);
        // Comme un index : les lignes rangées par le champ borné, les autres dans l'ordre d'enregistrement.
        const matching = () =>
          rowsOf(table)
            .filter(
              (row) =>
                conditions.every(([field, value]) => row[field] === value) &&
                upperBounds.every(([field, value]) => Number(row[field]) < value),
            )
            .sort((first, second) => {
              const [field] = upperBounds[0] ?? [];
              return field === undefined ? 0 : Number(first[field]) - Number(second[field]);
            });
        return { take: async (count: number) => matching().slice(0, count) };
      },
    }),
    insert: async (table: string, document: object) => {
      const id = `${table}:${counter++}`;
      rowsOf(table).push({ ...document, _id: id });
      return id;
    },
    delete: async (id: string) => {
      for (const rows of tables.values()) {
        const at = rows.findIndex(({ _id }) => _id === id);
        if (at !== -1) rows.splice(at, 1);
      }
    },
  };
  return { ctx: { db } as never, db, rows: rowsOf };
};

const NOW = Date.UTC(2026, 10, 4, 21, 37, 49);
const donationCutoff = unlinkedDonationCutoff(NOW);
const proofCutoff = deletionProofCutoff(NOW);

const donation = (kofiMessageId: string, donatedAt: number, fields: object = {}) => ({
  kofiMessageId,
  kofiTransactionId: "00000000-1111-2222-3333-444444444444",
  amountCents: 300,
  currency: "EUR",
  donatedAt,
  email: "donor@example.com",
  kofiName: "Un donateur",
  ...fields,
});

const proof = (runId: string, deletedAt: number) => ({
  runId,
  deletedAt,
  trigger: "button",
  erased: { hasEmail: true, ownedCanvases: 1 },
});

describe("un don jamais relié s'efface 12 mois après sa date (JOURNAL 2026-11-04)", () => {
  // La ligne entière part : montant, e-mail, nom Ko-fi et identifiants Ko-fi, rien ne reste
  it("erases the whole row of an unlinked donation older than 12 months", async () => {
    const { ctx, db, rows } = createFakeDb();
    await db.insert("donations", donation("old", donationCutoff - 1));

    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 1, isDone: true });
    expect(rows("donations")).toEqual([]);
  });

  // Juste avant la limite le don reste, jusqu'à la milliseconde où il a plus de 12 mois
  it("keeps a donation up to the limit and erases it right after", async () => {
    const { ctx, db, rows } = createFakeDb();
    await db.insert("donations", donation("before-limit", donationCutoff + 1));
    await db.insert("donations", donation("at-limit", donationCutoff));
    await db.insert("donations", donation("after-limit", donationCutoff - 1));

    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 1, isDone: true });
    expect(rows("donations").map((row) => row.kofiMessageId)).toEqual(["before-limit", "at-limit"]);
  });

  // Un don relié ne bouge jamais, quel que soit son âge
  it("never touches a linked donation, however old", async () => {
    const { ctx, db, rows } = createFakeDb();
    const linked = { userId: "1234", email: undefined, kofiName: undefined };
    await db.insert("donations", donation("linked-old", Date.UTC(2020, 0, 1), linked));
    await db.insert("donations", donation("linked-older", donationCutoff - 1, linked));
    await db.insert("donations", donation("unlinked-old", donationCutoff - 1));

    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 1, isDone: true });
    expect(rows("donations").map((row) => row.kofiMessageId)).toEqual(["linked-old", "linked-older"]);
  });

  // Un lot est borné : tant qu'il reste des dons expirés, la page n'est pas finie et l'appel suivant continue
  it("erases at most one batch per call and says when more are left", async () => {
    const { ctx, db, rows } = createFakeDb();
    for (let at = 0; at < 130; at += 1)
      await db.insert("donations", donation(`old-${at}`, donationCutoff - 1 - at));
    await db.insert("donations", donation("recent", donationCutoff + 1));

    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 100, isDone: false });
    expect(rows("donations")).toHaveLength(31);
    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 30, isDone: true });
    expect(rows("donations").map((row) => row.kofiMessageId)).toEqual(["recent"]);
    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 0, isDone: true });
  });

  // Une table sans don ne coûte rien et ne casse rien
  it("has nothing to erase when there is no donation", async () => {
    const { ctx } = createFakeDb();

    expect(await purgeUnlinkedDonations(ctx, donationCutoff)).toEqual({ purged: 0, isDone: true });
  });
});

describe("la preuve d'un effacement s'efface 5 ans après lui (JOURNAL 2026-11-04)", () => {
  // Juste avant la limite la preuve reste, juste après elle part
  it("keeps a proof up to the limit and erases it right after", async () => {
    const { ctx, db, rows } = createFakeDb();
    await db.insert("accountDeletions", proof("recent", proofCutoff + 1));
    await db.insert("accountDeletions", proof("at-limit", proofCutoff));
    await db.insert("accountDeletions", proof("old", proofCutoff - 1));
    await db.insert("accountDeletions", proof("older", Date.UTC(2018, 5, 1)));

    expect(await purgeDeletionProofs(ctx, proofCutoff)).toEqual({ purged: 2, isDone: true });
    expect(rows("accountDeletions").map((row) => row.runId)).toEqual(["recent", "at-limit"]);
  });

  // Une preuve d'un an n'est pas touchée : 12 mois valent pour les dons, pas pour elle
  it("does not erase a proof of a year ago", async () => {
    const { ctx, db, rows } = createFakeDb();
    await db.insert("accountDeletions", proof("a-year-ago", donationCutoff - 1));

    expect(await purgeDeletionProofs(ctx, proofCutoff)).toEqual({ purged: 0, isDone: true });
    expect(rows("accountDeletions")).toHaveLength(1);
  });

  // Un lot est borné, comme pour les dons
  it("erases at most one batch per call and says when more are left", async () => {
    const { ctx, db, rows } = createFakeDb();
    for (let at = 0; at < 101; at += 1)
      await db.insert("accountDeletions", proof(`run-${at}`, proofCutoff - 1 - at));

    expect(await purgeDeletionProofs(ctx, proofCutoff)).toEqual({ purged: 100, isDone: false });
    expect(await purgeDeletionProofs(ctx, proofCutoff)).toEqual({ purged: 1, isDone: true });
    expect(rows("accountDeletions")).toEqual([]);
  });
});

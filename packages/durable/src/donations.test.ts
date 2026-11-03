// Les dons Ko-fi tels que `convex/donations.ts` et `convex/users.ts` les écrivent, sur un faux `db` qui ne sait que ce qu'ils lui demandent.

import { describe, expect, it } from "vitest";
import {
  getLastDonationDates,
  getSupportOf,
  linkDonationByLogin,
  linkDonationsOf,
  listUnlinkedDonations,
  recordDonation,
} from "../convex/donations";
import { deleteAccountRows, upsertAccount } from "../convex/users";

type Row = { _id: string; [field: string]: unknown };

const createFakeDb = () => {
  const tables = new Map<string, Row[]>();
  let counter = 0;
  const rowsOf = (table: string): Row[] => {
    const rows = tables.get(table) ?? [];
    tables.set(table, rows);
    return rows;
  };
  const rowById = (id: string): Row => {
    const row = [...tables.values()].flat().find(({ _id }) => _id === id);
    if (!row) throw new Error(`ligne ${id} absente`);
    return row;
  };
  const db = {
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build: (range: { eq: (field: string, value: unknown) => unknown }) => unknown,
      ) => {
        const conditions: [string, unknown][] = [];
        const lowerBounds: [string, number][] = [];
        const range = {
          eq: (field: string, value: unknown) => {
            conditions.push([field, value]);
            return range;
          },
          gte: (field: string, value: number) => {
            lowerBounds.push([field, value]);
            return range;
          },
        };
        build(range);
        const matching = () =>
          rowsOf(table).filter(
            (row) =>
              conditions.every(([field, value]) => row[field] === value) &&
              lowerBounds.every(([field, value]) => Number(row[field]) >= value),
          );
        const query = (isReversed: boolean) => {
          const rows = () => (isReversed ? matching().reverse() : matching());
          return {
            first: async () => rows()[0] ?? null,
            unique: async () => rows()[0] ?? null,
            take: async (count: number) => rows().slice(0, count),
            collect: async () => rows(),
            order: (direction: "asc" | "desc") => query(direction === "desc"),
          };
        };
        return query(false);
      },
    }),
    get: async (id: string) => [...tables.values()].flat().find(({ _id }) => _id === id) ?? null,
    normalizeId: (table: string, id: string) => (id.startsWith(`${table}:`) ? id : null),
    insert: async (table: string, document: object) => {
      const Id = `${table}:${counter++}`;
      rowsOf(table).push({ ...document, _id: Id });
      return Id;
    },
    // Comme Convex : un champ mis à `undefined` part de la ligne.
    patch: async (id: string, fields: Record<string, unknown>) => {
      const row = rowById(id);
      for (const [field, value] of Object.entries(fields)) {
        if (value === undefined) delete row[field];
        else row[field] = value;
      }
    },
    delete: async (id: string) => {
      for (const rows of tables.values()) {
        const at = rows.findIndex(({ _id }) => _id === id);
        if (at !== -1) rows.splice(at, 1);
      }
    },
  };
  return { ctx: { db } as never, rows: rowsOf };
};

const donation = {
  kofiMessageId: "message-1",
  kofiTransactionId: "00000000-1111-2222-3333-444444444444",
  amountCents: 300,
  currency: "EUR",
  donatedAt: Date.UTC(2026, 10, 3, 12, 1, 22),
  email: " Donor@Example.COM ",
  kofiName: "Un donateur",
};

const signIn = (userId: string, email?: string) => ({
  userId,
  login: `login${userId}`,
  displayName: `Name${userId}`,
  avatarUrl: "https://avatar",
  ...(email ? { email } : {}),
});

describe("recordDonation (CDC des badges §3)", () => {
  // Zéro compte avec cet e-mail : le don attend, avec l'e-mail en minuscules et le nom Ko-fi
  it("keeps the donation unlinked with the address when no account carries it", async () => {
    const { ctx, rows } = createFakeDb();
    expect(await recordDonation(ctx, donation)).toEqual({ kind: "unlinked" });
    expect(rows("donations")).toMatchObject([
      {
        kofiMessageId: "message-1",
        amountCents: 300,
        currency: "EUR",
        email: "donor@example.com",
        kofiName: "Un donateur",
      },
    ]);
    expect(rows("donations")[0]).not.toHaveProperty("userId");
  });

  // Un seul compte porte l'e-mail : le don est relié, et l'e-mail et le nom Ko-fi n'existent plus
  it("links the donation and erases the address and the name when exactly one account carries it", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "Donor@example.com"));
    expect(await recordDonation(ctx, donation)).toEqual({
      kind: "linked",
      user: { userId: "1234", login: "login1234", displayName: "Name1234", avatarUrl: "https://avatar" },
    });
    const [row] = rows("donations");
    expect(row).toMatchObject({ userId: "1234", amountCents: 300, kofiMessageId: "message-1" });
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("kofiName");
  });

  // Deux comptes sur le même e-mail (Twitch le permet) : le don reste non relié
  it("keeps the donation unlinked when two accounts carry the address", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await upsertAccount(ctx, signIn("5678", "donor@example.com"));
    expect(await recordDonation(ctx, donation)).toEqual({ kind: "unlinked" });
    expect(rows("donations")[0]).toMatchObject({ email: "donor@example.com" });
    expect(rows("donations")[0]).not.toHaveProperty("userId");
  });

  // Ko-fi renvoie le même message tant qu'il n'a pas son 200 : un seul don
  it("records a message once", async () => {
    const { ctx, rows } = createFakeDb();
    expect(await recordDonation(ctx, donation)).toEqual({ kind: "unlinked" });
    expect(await recordDonation(ctx, donation)).toEqual({ kind: "duplicate" });
    expect(rows("donations")).toHaveLength(1);
  });

  // Les envois de test de Ko-fi partagent un `kofi_transaction_id` : seul le message départage
  it("accepts two messages that share a transaction id", async () => {
    const { ctx, rows } = createFakeDb();
    await recordDonation(ctx, donation);
    expect(await recordDonation(ctx, { ...donation, kofiMessageId: "message-2" })).toEqual({
      kind: "unlinked",
    });
    expect(rows("donations")).toHaveLength(2);
  });

  // Sans e-mail, rien à relier et rien à garder
  it("keeps no address when Ko-fi sent none", async () => {
    const { ctx, rows } = createFakeDb();
    const { email: _email, ...withoutEmail } = donation;
    expect(await recordDonation(ctx, withoutEmail)).toEqual({ kind: "unlinked" });
    expect(rows("donations")[0]).not.toHaveProperty("email");
  });

  // Un montant qui n'est pas un nombre entier positif de centimes n'entre jamais
  it("refuses an amount that is not a positive whole number of cents", async () => {
    const { ctx } = createFakeDb();
    await expect(recordDonation(ctx, { ...donation, amountCents: 0 })).rejects.toThrow();
    await expect(recordDonation(ctx, { ...donation, amountCents: 3.5 })).rejects.toThrow();
  });
});

describe("the account a donation is linked to (JOURNAL 2026-11-03)", () => {
  // Le renvoi d'un message déjà relié rend le compte : le web réécrit le miroir qu'une panne de Redis aurait laissé vide
  it("gives the account back when Ko-fi sends a linked message again, and nothing for an unlinked one", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await recordDonation(ctx, donation);
    expect(await recordDonation(ctx, donation)).toEqual({
      kind: "duplicate",
      user: { userId: "1234", login: "login1234", displayName: "Name1234", avatarUrl: "https://avatar" },
    });
    await recordDonation(ctx, { ...donation, kofiMessageId: "message-2", email: "nobody@example.com" });
    expect(await recordDonation(ctx, { ...donation, kofiMessageId: "message-2" })).toEqual({
      kind: "duplicate",
    });
    expect(rows("donations")).toHaveLength(2);
  });

  // Jamais l'e-mail du compte dans ce qui sort de Convex pour le miroir
  it("never gives the e-mail of the account back", async () => {
    const { ctx } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    const outcome = await recordDonation(ctx, donation);
    expect(JSON.stringify(outcome)).not.toContain("example.com");
  });
});

describe("the badge holders (CDC des badges §4)", () => {
  const since = Date.UTC(2025, 10, 2);

  // Un compte une fois, avec la date de son dernier don ; les dons plus vieux que le début et ceux qui attendent n'y sont pas
  it("gives the last donation date of each linked account read after the start, once", async () => {
    const { ctx } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await upsertAccount(ctx, signIn("5678", "friend@example.com"));
    await recordDonation(ctx, { ...donation, donatedAt: Date.UTC(2026, 0, 1) });
    await recordDonation(ctx, { ...donation, kofiMessageId: "message-2", donatedAt: Date.UTC(2026, 5, 1) });
    await recordDonation(ctx, {
      ...donation,
      kofiMessageId: "message-3",
      email: "friend@example.com",
      donatedAt: Date.UTC(2024, 5, 1),
    });
    await recordDonation(ctx, {
      ...donation,
      kofiMessageId: "message-4",
      email: "nobody@example.com",
      donatedAt: Date.UTC(2026, 6, 1),
    });
    expect(await getLastDonationDates(ctx, since)).toEqual([Date.UTC(2026, 5, 1)]);
  });
});

describe("the donations that wait for an account (CDC des badges §4)", () => {
  // La liste : les plus récents d'abord, le nom et l'e-mail Ko-fi, la date ; jamais le montant, jamais un don relié
  it("lists the unlinked donations, newest first, with no amount", async () => {
    const { ctx } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await recordDonation(ctx, { ...donation, kofiMessageId: "linked", email: "donor@example.com" });
    await recordDonation(ctx, {
      ...donation,
      kofiMessageId: "old",
      email: "A@b.org",
      kofiName: "Ancien",
      donatedAt: 1,
    });
    await recordDonation(ctx, {
      ...donation,
      kofiMessageId: "new",
      email: "c@d.org",
      kofiName: "Récent",
      donatedAt: 2,
    });
    const waiting = await listUnlinkedDonations(ctx);
    expect(waiting.map(({ kofiName }) => kofiName)).toEqual(["Récent", "Ancien"]);
    expect(waiting[0]).toMatchObject({ email: "c@d.org", donatedAt: 2 });
    expect(JSON.stringify(waiting)).not.toMatch(/amount|300/);
  });

  // Aucun don en attente : une liste vide
  it("lists nothing when no donation waits", async () => {
    const { ctx } = createFakeDb();
    expect(await listUnlinkedDonations(ctx)).toEqual([]);
  });

  // Relier : le compte se trouve par son pseudo (casse et « @ » ignorés), le don prend son userId et perd l'e-mail et le nom Ko-fi
  it("links a donation by login and erases the e-mail and the Ko-fi name", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "other@example.com"));
    await recordDonation(ctx, donation);
    const donationId = (await listUnlinkedDonations(ctx))[0]?.donationId ?? "";
    expect(await linkDonationByLogin(ctx, donationId, " @Login1234 ")).toEqual({
      ok: true,
      value: { userId: "1234", login: "login1234", displayName: "Name1234", avatarUrl: "https://avatar" },
    });
    const [row] = rows("donations");
    expect(row).toMatchObject({ userId: "1234", amountCents: 300 });
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("kofiName");
    expect(await getSupportOf(ctx, "1234")).toMatchObject({ lifetimeCents: 300 });
  });

  // Un pseudo inconnu : un refus, et rien ne change sur le don
  it("changes nothing for a login no account carries", async () => {
    const { ctx, rows } = createFakeDb();
    await recordDonation(ctx, donation);
    const donationId = (await listUnlinkedDonations(ctx))[0]?.donationId ?? "";
    expect(await linkDonationByLogin(ctx, donationId, "nobody")).toEqual({
      ok: false,
      error: "unknown_account",
    });
    expect(rows("donations")[0]).toMatchObject({ email: "donor@example.com", kofiName: "Un donateur" });
    expect(rows("donations")[0]).not.toHaveProperty("userId");
  });

  // Un don déjà relié ne se relie pas deux fois ; un identifiant qui n'est pas un don est refusé
  it("refuses a donation that is already linked and an identifier that is not a donation", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await recordDonation(ctx, donation);
    const linked = rows("donations")[0]?._id;
    expect(await linkDonationByLogin(ctx, linked ?? "", "login1234")).toEqual({
      ok: false,
      error: "already_linked",
    });
    expect(await linkDonationByLogin(ctx, "users:0", "login1234")).toEqual({
      ok: false,
      error: "unknown_donation",
    });
  });
});

describe("the link at sign-in (CDC des badges §3)", () => {
  // Le don arrivé avant le compte se relie à sa première connexion, avec l'e-mail Twitch en capitales
  it("links a waiting donation when the only account carrying the address signs in", async () => {
    const { ctx, rows } = createFakeDb();
    await recordDonation(ctx, donation);
    await upsertAccount(ctx, signIn("1234", "DONOR@example.com"));
    const [row] = rows("donations");
    expect(row).toMatchObject({ userId: "1234" });
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("kofiName");
    expect(rows("users")[0]).toMatchObject({ email: "donor@example.com" });
  });

  // Une reconnexion relie aussi un don arrivé entre deux connexions
  it("links a donation that arrived unlinked on the next sign-in", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "other@example.com"));
    await recordDonation(ctx, donation);
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    expect(rows("donations")[0]).toMatchObject({ userId: "1234" });
  });

  // Deux comptes sur cet e-mail : aucun n'obtient le don
  it("links nothing while two accounts carry the address", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await upsertAccount(ctx, signIn("5678", "donor@example.com"));
    await recordDonation(ctx, donation);
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await upsertAccount(ctx, signIn("5678", "donor@example.com"));
    expect(rows("donations")[0]).not.toHaveProperty("userId");
    expect(await linkDonationsOf(ctx, "1234", "donor@example.com")).toBe(0);
  });

  // Une connexion sans e-mail (portée réduite) efface l'e-mail gardé et ne relie rien
  it("links nothing and drops the stored address when the token carries none", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await recordDonation(ctx, { ...donation, kofiMessageId: "message-2", email: "someone@else.org" });
    await upsertAccount(ctx, signIn("1234"));
    expect(rows("users")[0]).not.toHaveProperty("email");
    expect(rows("donations")[0]).not.toHaveProperty("userId");
  });
});

describe("getSupportOf (CDC des badges §3)", () => {
  // Le cumul à vie additionne tous les dons du compte, et la date est celle du dernier
  it("adds up the donations of the account and gives the date of the last", async () => {
    const { ctx } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await recordDonation(ctx, donation);
    await recordDonation(ctx, {
      ...donation,
      kofiMessageId: "message-2",
      amountCents: 700,
      donatedAt: Date.UTC(2026, 11, 3),
    });
    await recordDonation(ctx, {
      ...donation,
      kofiMessageId: "message-3",
      amountCents: 900,
      email: "other@example.com",
    });
    expect(await getSupportOf(ctx, "1234")).toEqual({
      lifetimeCents: 1000,
      lastDonatedAt: Date.UTC(2026, 11, 3),
    });
  });

  // Aucun don relié : rien
  it("gives nothing for an account without a donation", async () => {
    const { ctx } = createFakeDb();
    expect(await getSupportOf(ctx, "1234")).toBeNull();
  });
});

describe("deleting an account (CDC des badges §6)", () => {
  const deletion = {
    userId: "1234",
    runId: "run-1",
    deletedAt: 1,
    trigger: "button",
    ownedCanvases: 0,
  } as const;

  // Ses dons reliés partent avec la ligne du compte ; ceux des autres et ceux qui attendent restent
  it("erases the linked donations of the account and no other", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await upsertAccount(ctx, signIn("5678", "friend@example.com"));
    await recordDonation(ctx, donation);
    await recordDonation(ctx, { ...donation, kofiMessageId: "message-2", email: "friend@example.com" });
    await recordDonation(ctx, { ...donation, kofiMessageId: "message-3", email: "nobody@example.com" });
    expect(await deleteAccountRows(ctx, deletion)).toEqual({
      login: "login1234",
      avatarUrl: "https://avatar",
    });
    expect(rows("donations").map(({ kofiMessageId }) => kofiMessageId)).toEqual(["message-2", "message-3"]);
    expect(rows("users").map(({ userId }) => userId)).toEqual(["5678"]);
  });

  // Une reprise de la suppression ne double pas la preuve et ne rejette pas
  it("is safe to run again", async () => {
    const { ctx, rows } = createFakeDb();
    await upsertAccount(ctx, signIn("1234", "donor@example.com"));
    await recordDonation(ctx, donation);
    await deleteAccountRows(ctx, deletion);
    expect(await deleteAccountRows(ctx, deletion)).toBeNull();
    expect(rows("donations")).toHaveLength(0);
    expect(rows("accountDeletions")).toHaveLength(1);
  });
});

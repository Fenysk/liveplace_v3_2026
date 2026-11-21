import { describe, expect, it } from "vitest";
import { createStreamlabsCharitySource } from "./streamlabs-charity";

// Un faux Streamlabs Charity, aux formes relevées le 20/11/2026 : jamais l'API réelle.
type FakeDonation = {
  id: string | number;
  display_name: string | null;
  original_amount: number;
  original_currency: string;
  converted_amount: number;
  converted_currency: string;
  created_at: string;
};

const donation = (id: string, cents: number, createdAt = "2026-11-20 12:00:00"): FakeDonation => ({
  id,
  display_name: `donateur ${id}`,
  original_amount: cents,
  original_currency: "EUR",
  converted_amount: cents,
  converted_currency: "EUR",
  created_at: createdAt,
});

function createFakeCharity(options: { campaignDonations?: unknown[]; teamDonations?: unknown[] } = {}) {
  const calls: string[] = [];
  const state = { status: 200 };
  const answer = (path: string, query: URLSearchParams): unknown => {
    if (path === "/users/campaigns/dageecheegamer/dames-4-games-2026") return { id: "925410430296397505" };
    if (path === "/users/campaigns/925410430296397505/donations") return options.campaignDonations ?? [];
    if (path === "/teams/@zevent-2026/zevent-2026")
      return { id: "945347664248182491", campaign: { id: "1" } };
    if (path === "/teams/945347664248182491/donations") {
      const page = Number(query.get("page") ?? 1);
      return page === 1 ? (options.teamDonations ?? []) : [];
    }
    return undefined;
  };
  const fakeFetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    calls.push(`${path}${url.search}`);
    if (state.status !== 200) return new Response("panne", { status: state.status });
    const body = answer(path, url.searchParams);
    return body === undefined ? new Response("absent", { status: 404 }) : Response.json(body);
  };
  return { calls, state, fetch: fakeFetch as typeof fetch };
}

const signal = new AbortController().signal;
const personal = {
  kind: "user",
  user: "dageecheegamer",
  campaign: "dames-4-games-2026",
} as const;
const team = {
  kind: "team",
  team: "zevent-2026",
  campaign: "zevent-2026",
  memberId: "556591525052683658",
} as const;

describe("la lecture des dons d'une page personnelle", () => {
  it("rend le montant converti en centimes, sa devise, le nom tel quel et l'heure en UTC", async () => {
    const fake = createFakeCharity({
      campaignDonations: [
        {
          ...donation("100", 500),
          original_amount: 5_00,
          original_currency: "USD",
          converted_amount: 460,
          converted_currency: "EUR",
          display_name: "  Zoé 🎉  ",
        },
      ],
    });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    expect(await source.listDonations(personal, signal)).toEqual([
      { id: "100", name: "  Zoé 🎉  ", cents: 460, currency: "EUR", donatedAt: Date.UTC(2026, 10, 20, 12) },
    ]);
  });

  it("lit une heure avec fuseau comme une heure sans fuseau : toujours en UTC", async () => {
    const fake = createFakeCharity({
      campaignDonations: [
        donation("1", 100, "2026-11-20T12:00:00Z"),
        donation("2", 100, "2026-11-20 12:00:00"),
        donation("3", 100, "2026-11-20T13:00:00+01:00"),
      ],
    });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    const times = (await source.listDonations(personal, signal)).map(({ donatedAt }) => donatedAt);

    expect(times).toEqual([
      Date.UTC(2026, 10, 20, 12),
      Date.UTC(2026, 10, 20, 12),
      Date.UTC(2026, 10, 20, 12),
    ]);
  });

  it("accepte un identifiant numérique, un donateur sans nom et une liste enveloppée dans data", async () => {
    const fake = createFakeCharity({
      campaignDonations: [{ ...donation("0", 250), id: 42, display_name: null }],
    });
    const wrapped = (async (input: string | URL | Request) => {
      const reply = await fake.fetch(input);
      const body: unknown = await reply.json();
      return Response.json(Array.isArray(body) ? { data: body } : body);
    }) as typeof fetch;

    const donations = await createStreamlabsCharitySource({ fetch: wrapped }).listDonations(personal, signal);

    expect(donations).toEqual([
      { id: "42", name: "", cents: 250, currency: "EUR", donatedAt: Date.UTC(2026, 10, 20, 12) },
    ]);
  });

  it("dédoublonne par identifiant et laisse de côté une entrée illisible", async () => {
    const fake = createFakeCharity({
      campaignDonations: [donation("1", 100), donation("1", 100), { id: "2" }, donation("3", 300)],
    });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    const ids = (await source.listDonations(personal, signal)).map(({ id }) => id);

    expect(ids).toEqual(["1", "3"]);
  });

  it("garde en mémoire l'identifiant de la campagne : un seul appel pour la retrouver", async () => {
    const fake = createFakeCharity({ campaignDonations: [donation("1", 100)] });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    await source.listDonations(personal, signal);
    await source.listDonations(personal, signal);

    expect(fake.calls.filter((call) => call.startsWith("/users/campaigns/dageecheegamer"))).toHaveLength(1);
    expect(fake.calls.filter((call) => call.endsWith("/donations"))).toHaveLength(2);
  });

  it("rend une liste vide pour une campagne sans don", async () => {
    const source = createStreamlabsCharitySource({ fetch: createFakeCharity().fetch });

    expect(await source.listDonations(personal, signal)).toEqual([]);
  });
});

describe("la lecture des dons d'un membre d'équipe", () => {
  it("résout l'équipe puis demande ses dons avec member_id, et lit le don dans chaque entrée", async () => {
    const fake = createFakeCharity({
      teamDonations: [
        { id: "9", donation: donation("500", 1_000), member: { id: "556591525052683658" } },
        { id: "10", donation: donation("501", 25), member: { id: "556591525052683658" } },
      ],
    });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    const donations = await source.listDonations(team, signal);

    expect(donations.map(({ id, cents }) => [id, cents])).toEqual([
      ["500", 1_000],
      ["501", 25],
    ]);
    expect(fake.calls).toEqual([
      "/teams/@zevent-2026/zevent-2026",
      "/teams/945347664248182491/donations?member_id=556591525052683658",
    ]);
  });

  it("sans membre, lit l'équipe entière", async () => {
    const fake = createFakeCharity({ teamDonations: [{ id: "9", donation: donation("500", 1_000) }] });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    await source.listDonations({ kind: "team", team: "zevent-2026", campaign: "zevent-2026" }, signal);

    expect(fake.calls[1]).toBe("/teams/945347664248182491/donations");
  });

  it("relit les pages d'une liste pleine et dédoublonne ce qui se recoupe", async () => {
    const full = Array.from({ length: 2000 }, (_, index) => ({
      id: String(index),
      donation: donation(String(index), 10),
    }));
    const second = [
      { id: "1999", donation: donation("1999", 10) },
      { id: "2000", donation: donation("2000", 10) },
    ];
    const fake = createFakeCharity({ teamDonations: full });
    const paged = (async (input: string | URL | Request) =>
      new URL(String(input)).searchParams.get("page") === "2"
        ? Response.json(second)
        : fake.fetch(input)) as typeof fetch;

    const donations = await createStreamlabsCharitySource({ fetch: paged }).listDonations(team, signal);

    expect(donations).toHaveLength(2001);
  });
});

describe("les pannes de l'API", () => {
  it("jette quand l'API répond une erreur", async () => {
    const fake = createFakeCharity();
    fake.state.status = 503;
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });

    await expect(source.listDonations(personal, signal)).rejects.toThrow("503");
  });

  it("jette quand la page n'existe pas", async () => {
    const source = createStreamlabsCharitySource({ fetch: createFakeCharity().fetch });

    await expect(source.listDonations({ ...personal, campaign: "autre" }, signal)).rejects.toThrow("404");
  });

  it("jette quand la réponse n'a pas la forme attendue : pas de liste, pas d'identifiant", async () => {
    const notAList = (async () => Response.json({ id: "1", donations: "?" })) as typeof fetch;
    const noId = (async () => Response.json({ name: "x" })) as typeof fetch;

    await expect(
      createStreamlabsCharitySource({ fetch: notAList }).listDonations(personal, signal),
    ).rejects.toThrow("liste de dons");
    await expect(
      createStreamlabsCharitySource({ fetch: noId }).listDonations(personal, signal),
    ).rejects.toThrow();
  });

  it("jette quand une liste pleine n'a aucun don lisible : l'API a changé de forme, ce n'est pas « aucun don »", async () => {
    const fake = createFakeCharity({ campaignDonations: [{ montant: 5 }, { montant: 6 }] });

    await expect(
      createStreamlabsCharitySource({ fetch: fake.fetch }).listDonations(personal, signal),
    ).rejects.toThrow("aucun don lisible");
  });

  it("transmet le signal d'arrêt : un appel trop long est coupé", async () => {
    const hanging = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("coupé")));
      })) as typeof fetch;
    const controller = new AbortController();
    const reading = createStreamlabsCharitySource({ fetch: hanging }).listDonations(
      personal,
      controller.signal,
    );

    controller.abort();

    await expect(reading).rejects.toThrow("coupé");
  });

  it("ne retient pas l'identifiant d'une campagne introuvable : la lecture suivante le redemande", async () => {
    const fake = createFakeCharity({ campaignDonations: [donation("1", 100)] });
    const source = createStreamlabsCharitySource({ fetch: fake.fetch });
    fake.state.status = 500;
    await source.listDonations(personal, signal).catch(() => undefined);
    fake.state.status = 200;

    expect(await source.listDonations(personal, signal)).toHaveLength(1);
  });
});

// CDC 2026 §8, Mode événement (JOURNAL 2026-11-20) : la lecture des dons d'une page Streamlabs Charity, par l'API publique que
// sa page appelle elle-même (aucune clé, aucune limite de débit annoncée). Deux temps : l'identifiant de la campagne ou de l'équipe,
// qui ne change pas et se retient, puis la liste des dons, relue en entier à chaque fois (la pagination au-delà de 2000 dons n'est
// pas fiable : on dédoublonne par identifiant).

import type { CharityDonation, CharitySource } from "@liveplace/domain/charity-event";
import type { CharityDonationSource } from "@liveplace/domain/ports";
import { z } from "zod";

const API_URL = "https://streamlabscharity.com/api/v1";
const PAGE_SIZE = 2000; // ce que l'API rend au plus par appel
const MAX_PAGES = 5; // 10 000 dons : bien au-delà d'une collecte de streamer

const IdSchema = z.union([z.string(), z.number()]).transform(String);

// Un don, tel que l'API le rend. Le montant converti est dans la devise de la campagne : c'est lui qui donne les pixels.
const DonationSchema = z.object({
  id: IdSchema,
  display_name: z.string().nullish(),
  converted_amount: z.number().int(),
  converted_currency: z.string().min(1),
  created_at: z.string(),
});

// L'équipe rend des `{ id, donation, member }` : le don est dedans.
const TeamEntrySchema = z.object({ donation: DonationSchema });

const IdentifiedSchema = z.object({ id: IdSchema });

// L'API dit « 2026-11-20 12:34:56 » ou « 2026-11-20T12:34:56Z » : toujours en UTC, même sans fuseau écrit.
const UTC_ZONE = /(Z|[+-]\d\d:?\d\d)$/i;

const parseUtc = (text: string): number => {
  const iso = text.trim().replace(" ", "T");
  return Date.parse(UTC_ZONE.test(iso) ? iso : `${iso}Z`);
};

const donationOf = (donation: z.infer<typeof DonationSchema>): CharityDonation | null => {
  const donatedAt = parseUtc(donation.created_at);
  if (Number.isNaN(donatedAt)) return null;
  return {
    id: donation.id,
    name: donation.display_name ?? "",
    cents: donation.converted_amount,
    currency: donation.converted_currency,
    donatedAt,
  };
};

// L'entrée d'une liste : le don lui-même, ou, pour une équipe, `{ id, donation, member }`. Une entrée illisible est laissée de côté.
const donationOfEntry = (source: CharitySource, entry: unknown): CharityDonation | null => {
  const parsed = source.kind === "team" ? TeamEntrySchema.safeParse(entry) : DonationSchema.safeParse(entry);
  if (!parsed.success) return null;
  return donationOf("donation" in parsed.data ? parsed.data.donation : parsed.data);
};

// Une réponse peut envelopper son contenu dans `data`.
const unwrapped = (json: unknown): unknown => {
  if (typeof json === "object" && json !== null && "data" in json && !("id" in json)) return json.data;
  return json;
};

export type StreamlabsCharityDeps = {
  fetch?: typeof fetch;
  apiUrl?: string; // un faux serveur en preuve
};

export function createStreamlabsCharitySource({
  fetch: fetchJson = globalThis.fetch,
  apiUrl = API_URL,
}: StreamlabsCharityDeps = {}): CharityDonationSource {
  const ids = new Map<string, string>(); // l'identifiant de la campagne ou de l'équipe, par page

  const getJson = async (path: string, signal: AbortSignal): Promise<unknown> => {
    const response = await fetchJson(`${apiUrl}${path}`, {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) throw new Error(`Streamlabs Charity a répondu ${response.status} sur ${path}`);
    return unwrapped(await response.json());
  };

  // La campagne d'une page personnelle, ou l'équipe d'une page d'équipe : son identifiant ouvre la liste des dons.
  const getTargetId = async (source: CharitySource, signal: AbortSignal): Promise<string> => {
    const path =
      source.kind === "user"
        ? `/users/campaigns/${source.user}/${source.campaign}`
        : `/teams/@${source.team}/${source.campaign}`;
    const known = ids.get(path);
    if (known) return known;
    const { id } = IdentifiedSchema.parse(await getJson(path, signal));
    ids.set(path, id);
    return id;
  };

  const donationsPath = (source: CharitySource, targetId: string, page: number): string => {
    const query = new URLSearchParams();
    if (source.kind === "team" && source.memberId !== undefined) query.set("member_id", source.memberId);
    if (page > 1) query.set("page", String(page));
    const suffix = query.size > 0 ? `?${query}` : "";
    return source.kind === "user"
      ? `/users/campaigns/${targetId}/donations${suffix}`
      : `/teams/${targetId}/donations${suffix}`;
  };

  const listPage = async (path: string, signal: AbortSignal): Promise<unknown[]> => {
    const list = await getJson(path, signal);
    if (!Array.isArray(list))
      throw new Error(`Streamlabs Charity : une liste de dons était attendue sur ${path}`);
    return list;
  };

  // Une page de la liste dans `donations`. Rend le nombre d'entrées reçues et si la page a apporté un don de plus.
  const addPage = async (
    source: CharitySource,
    path: string,
    donations: Map<string, CharityDonation>,
    signal: AbortSignal,
  ): Promise<{ received: number; isNew: boolean }> => {
    const entries = await listPage(path, signal);
    const before = donations.size;
    for (const entry of entries) {
      const donation = donationOfEntry(source, entry);
      if (donation) donations.set(donation.id, donation);
    }
    return { received: entries.length, isNew: donations.size > before };
  };

  return {
    async listDonations(source, signal) {
      const targetId = await getTargetId(source, signal);
      const donations = new Map<string, CharityDonation>();
      let listed = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { received, isNew } = await addPage(
          source,
          donationsPath(source, targetId, page),
          donations,
          signal,
        );
        listed += received;
        if (received < PAGE_SIZE || !isNew) break;
      }
      // Une liste pleine dont aucun don ne se lit : l'API a changé de forme, ce n'est pas « aucun don ».
      if (listed > 0 && donations.size === 0)
        throw new Error("Streamlabs Charity : aucun don lisible dans la liste");
      return [...donations.values()];
    },
  };
}

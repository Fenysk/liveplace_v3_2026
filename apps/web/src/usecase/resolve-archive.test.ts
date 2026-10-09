import type { User } from "@liveplace/domain";
import type { Archive, DurableStore, LinkedCanvas } from "@liveplace/domain/ports";
import { describe, expect, it, vi } from "vitest";
import { resolveArchive } from "./resolve-archive";

const owner: User = {
  userId: "1234",
  login: "fenysk",
  displayName: "Fenysk",
  avatarUrl: "https://static-cdn.jtvnw.net/fenysk.png",
};
const archive: Archive = {
  canvasId: "opaque-archive",
  width: 100,
  height: 100,
  createdAt: 1000,
  archivedAt: 2000,
  linkCode: "3mAqXz9RbK",
};

// Un double qui ne connaît qu'un propriétaire, et ce que Convex répond pour un code.
const durableWith = (linked: LinkedCanvas | null) => {
  const lookups: { ownerId: string; linkCode: string }[] = [];
  const durable: Pick<DurableStore, "getUserByLogin" | "getArchiveByLinkCode"> = {
    getUserByLogin: async (login) => (login === owner.login ? owner : null),
    getArchiveByLinkCode: async (ownerId, linkCode) => {
      lookups.push({ ownerId, linkCode });
      return linked;
    },
  };
  return { durable, lookups };
};

describe("resolveArchive, le live du propriétaire (Écart §4, JOURNAL 2026-10-07)", () => {
  // Le bandeau d'une archive porte le live de son streamer dès le rendu serveur ; pour une archive introuvable, il n'a rien à montrer
  it("carries the owner's live in the banner's profile, and asks for it nowhere else", async () => {
    const asked: string[] = [];
    const tracker = {
      getLive: async (ownerId: string) => {
        asked.push(ownerId);
        return { category: "Art" };
      },
    };
    const found = durableWith({ status: "archived", archive });
    const missing = durableWith(null);

    const page = await resolveArchive(found.durable, "fenysk", "3mAqXz9RbK", tracker);
    const absent = await resolveArchive(missing.durable, "fenysk", "3mAqXz9RbK", tracker);

    expect(page).toMatchObject({
      status: "archived",
      archive: { owner: { twitchLive: { category: "Art" } } },
    });
    expect(absent).toEqual({
      status: "missing",
      owner: expect.not.objectContaining({ twitchLive: expect.anything() }),
    });
    expect(asked).toEqual([owner.userId]);
  });
});

describe("resolveArchive (Écart §10.3, JOURNAL 2026-10-06)", () => {
  // Résout un pseudo et un code en archive, avec le profil du propriétaire pour le bandeau et les dates
  it("resolves a login and a code to an archive, with the owner's profile and the dates", async () => {
    const { durable, lookups } = durableWith({ status: "archived", archive });

    expect(await resolveArchive(durable, "fenysk", "3mAqXz9RbK")).toEqual({
      status: "archived",
      archive: {
        canvasId: "opaque-archive",
        owner: { displayName: "Fenysk", login: "fenysk", avatarUrl: owner.avatarUrl },
        createdAt: 1000,
        archivedAt: 2000,
      },
    });
    expect(lookups).toEqual([{ ownerId: "1234", linkCode: "3mAqXz9RbK" }]);
  });

  // Garde le thème d'une archive qui en a un, et cherche le pseudo en minuscules
  it("keeps the theme of an archive that has one, and looks the login up in lowercase", async () => {
    const { durable } = durableWith({ status: "archived", archive: { ...archive, theme: "Printemps" } });

    expect(await resolveArchive(durable, "Fenysk", "3mAqXz9RbK")).toMatchObject({
      status: "archived",
      archive: { theme: "Printemps" },
    });
  });

  // Un code rouvert redevenu le canvas actif renvoie vers `/{login}`
  it("sends a code reopened and active again to /{login}", async () => {
    const { durable } = durableWith({ status: "active" });

    expect(await resolveArchive(durable, "fenysk", "3mAqXz9RbK")).toEqual({
      status: "active",
      login: "fenysk",
    });
  });

  // Un pseudo inconnu ne rend rien : la page n'a que le pseudo à dire
  it("gives null for an unknown login", async () => {
    const known = durableWith({ status: "archived", archive });

    expect(await resolveArchive(known.durable, "nobody", "3mAqXz9RbK")).toBeNull();
  });

  // Un propriétaire connu, une archive qui n'existe pas : la page introuvable dit son nom affiché
  it("gives the owner back when the owner is known and the archive is not", async () => {
    const unknownCode = durableWith(null);

    expect(await resolveArchive(unknownCode.durable, "fenysk", "3mAqXz9RbK")).toEqual({
      status: "missing",
      owner: { displayName: "Fenysk", login: "fenysk", avatarUrl: owner.avatarUrl },
    });
  });

  // Ce qui n'a pas la forme d'un code ne demande rien à Convex pour l'archive, et le propriétaire reste dit
  it("gives the owner back for what has no code shape, without asking Convex for the archive", async () => {
    const known = durableWith({ status: "archived", archive });
    const lookup = vi.spyOn(known.durable, "getArchiveByLinkCode");

    for (const code of ["", "short", "3mAqXz9RbK1", "3mAqXz9Rb0", "../../..."])
      expect(await resolveArchive(known.durable, "fenysk", code)).toMatchObject({
        status: "missing",
        owner: { displayName: "Fenysk" },
      });

    expect(lookup).not.toHaveBeenCalled();
  });
});

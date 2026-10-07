import { MAX_ARCHIVES } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import {
  pickLinkedCanvas,
  planArchive,
  planDiscard,
  planRename,
  planReopen,
  type StoredCanvas,
  toOwnerCanvases,
} from "./canvas-plan";

const ownerId = "owner-1";

const active: StoredCanvas = {
  canvasId: "canvas-active",
  ownerId,
  isActive: true,
  width: 50,
  height: 50,
  createdAt: 1000,
};

const archiveOf = (index: number, more: Partial<StoredCanvas> = {}): StoredCanvas => ({
  canvasId: `canvas-archive-${index}`,
  ownerId,
  isActive: false,
  width: 100,
  height: 100,
  createdAt: 100 * index,
  archivedAt: 100 * index + 50,
  linkCode: `code${index}`.padEnd(10, "x"),
  ...more,
});

const archives = (count: number) => Array.from({ length: count }, (_, index) => archiveOf(index + 1));

const archiving = {
  ownerId,
  outgoingId: active.canvasId,
  incoming: { canvasId: "canvas-new", width: 50, height: 50 },
  archivedAt: 5000,
  linkCode: "freshcode1",
  maxArchives: MAX_ARCHIVES,
};

describe("planArchive (Écart §15, JOURNAL 2026-10-06)", () => {
  // Archive l'actif avec sa date, son code et son nom, et insère le nouveau canvas actif, né à cet instant
  it("archives the active canvas with its date, code and name, and inserts the new one, born at that instant", () => {
    const plan = planArchive([active], { ...archiving, name: "Printemps" });

    expect(plan).toEqual({
      ok: true,
      writes: [
        {
          kind: "patch",
          canvasId: active.canvasId,
          fields: { isActive: false, archivedAt: 5000, linkCode: "freshcode1", name: "Printemps" },
        },
        {
          kind: "insert",
          canvas: {
            canvasId: "canvas-new",
            ownerId,
            isActive: true,
            width: 50,
            height: 50,
            createdAt: 5000,
            purgedBeforeVersion: 0,
            purgedBeforeTs: 0,
          },
        },
      ],
    });
  });

  // Garde le code d'un canvas qui en avait un (rouvert, puis archivé de nouveau), et retire son ancien nom sans nom donné
  it("keeps the code of a canvas that had one, and drops its old name when none is given", () => {
    const reopened = { ...active, linkCode: "oldcode123", name: "Avant" };

    // Strict : `name` est là, à `undefined`, car c'est ce qui le retire du document.
    expect(planArchive([reopened], archiving)).toStrictEqual({
      ok: true,
      writes: [
        {
          kind: "patch",
          canvasId: active.canvasId,
          fields: { isActive: false, archivedAt: 5000, linkCode: "oldcode123", name: undefined },
        },
        expect.objectContaining({ kind: "insert" }),
      ],
    });
  });

  // Refuse le sixième archivage : le plafond se vérifie dans la transaction
  it("refuses a sixth archive: the ceiling is checked in the transaction", () => {
    expect(planArchive([active, ...archives(MAX_ARCHIVES - 1)], archiving).ok).toBe(true);
    expect(planArchive([active, ...archives(MAX_ARCHIVES)], archiving)).toEqual({
      ok: false,
      error: "archives_full",
    });
  });

  // Refuse un sortant qui n'est pas l'actif de ce propriétaire : une archive, un canvas d'un autre, un inconnu
  it("refuses an outgoing canvas that is not this owner's active one: an archive, another owner's, unknown", () => {
    const others = [active, archiveOf(1)];

    for (const outgoingId of ["canvas-archive-1", "canvas-elsewhere"])
      expect(planArchive(others, { ...archiving, outgoingId })).toEqual({ ok: false, error: "not_active" });
    expect(planArchive(others, { ...archiving, ownerId: "owner-2" })).toEqual({
      ok: false,
      error: "not_active",
    });
  });
});

describe("planReopen (Écart §15, JOURNAL 2026-10-06)", () => {
  const reopening = {
    ownerId,
    outgoingId: active.canvasId,
    reopenedId: "canvas-archive-2",
    archivedAt: 7000,
    linkCode: "freshcode1",
  };

  // Échange l'actif et l'archive : l'actif prend sa place, l'archive revient sans date, avec son code et son nom
  it("swaps the active canvas and the archive: the active one takes its place, the archive comes back without a date", () => {
    // Strict : l'archive qui revient ne porte ni `linkCode` ni `name` dans ses champs, donc les garde.
    expect(planReopen([active, ...archives(MAX_ARCHIVES)], reopening)).toStrictEqual({
      ok: true,
      writes: [
        {
          kind: "patch",
          canvasId: active.canvasId,
          fields: { isActive: false, archivedAt: 7000, linkCode: "freshcode1" },
        },
        { kind: "patch", canvasId: "canvas-archive-2", fields: { isActive: true, archivedAt: undefined } },
      ],
    });
  });

  // Le nombre d'archives ne change pas, même avec le plafond atteint
  it("leaves the number of archives alone, even at the ceiling", () => {
    const plan = planReopen([active, ...archives(MAX_ARCHIVES)], reopening);

    expect(plan.ok && plan.writes.every(({ kind }) => kind === "patch")).toBe(true);
  });

  // Le sortant qui avait déjà un code le garde
  it("lets an outgoing canvas that already had a code keep it", () => {
    const plan = planReopen([{ ...active, linkCode: "mycode1234" }, ...archives(2)], reopening);

    expect(plan).toMatchObject({ ok: true, writes: [{ fields: { linkCode: "mycode1234" } }, {}] });
  });

  // Refuse ce qui n'est pas une archive de ce propriétaire, et un sortant qui n'est pas l'actif
  it("refuses what is not an archive of this owner, and an outgoing canvas that is not the active one", () => {
    const canvases = [active, ...archives(2)];

    expect(planReopen(canvases, { ...reopening, reopenedId: active.canvasId })).toEqual({
      ok: false,
      error: "not_archive",
    });
    expect(planReopen(canvases, { ...reopening, reopenedId: "canvas-elsewhere" })).toEqual({
      ok: false,
      error: "not_archive",
    });
    expect(planReopen(canvases, { ...reopening, outgoingId: "canvas-archive-1" })).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(planReopen(canvases, { ...reopening, ownerId: "owner-2" })).toEqual({
      ok: false,
      error: "not_active",
    });
  });
});

describe("planDiscard (Écart §15, JOURNAL 2026-10-06)", () => {
  // Supprime une archive de ce propriétaire
  it("deletes an archive of this owner", () => {
    expect(planDiscard([active, ...archives(2)], ownerId, "canvas-archive-2")).toEqual({
      ok: true,
      writes: [{ kind: "delete", canvasId: "canvas-archive-2" }],
    });
  });

  // Ne supprime jamais le canvas actif, ni un canvas d'un autre propriétaire, ni un inconnu
  it("never deletes the active canvas, another owner's, or an unknown one", () => {
    const canvases = [active, ...archives(2)];

    expect(planDiscard(canvases, ownerId, active.canvasId)).toEqual({ ok: false, error: "not_archive" });
    expect(planDiscard(canvases, "owner-2", "canvas-archive-2")).toEqual({ ok: false, error: "not_archive" });
    expect(planDiscard(canvases, ownerId, "canvas-elsewhere")).toEqual({ ok: false, error: "not_archive" });
  });
});

describe("planRename (Écart §15, JOURNAL 2026-10-06)", () => {
  // Pose le nom sur le canvas actif de ce propriétaire, rien d'autre
  it("sets the name on the active canvas of this owner, and writes nothing else", () => {
    expect(planRename([active, ...archives(2)], ownerId, active.canvasId, "Printemps")).toEqual({
      ok: true,
      writes: [{ kind: "patch", canvasId: active.canvasId, fields: { name: "Printemps" } }],
    });
  });

  // Sans nom, le patch porte un `name` à `undefined` : c'est ce qui retire le champ du document
  it("removes the name without one: the patch carries an undefined name, which drops the field", () => {
    const plan = planRename([{ ...active, name: "Printemps" }], ownerId, active.canvasId, undefined);

    expect(plan).toStrictEqual({
      ok: true,
      writes: [{ kind: "patch", canvasId: active.canvasId, fields: { name: undefined } }],
    });
  });

  // Jamais une archive, ni le canvas d'un autre propriétaire, ni un inconnu : `not_active`
  it("never renames an archive, another owner's canvas or an unknown one", () => {
    const canvases = [active, ...archives(2)];

    expect(planRename(canvases, ownerId, "canvas-archive-2", "Autre")).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(planRename(canvases, "owner-2", active.canvasId, "Autre")).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(planRename(canvases, ownerId, "canvas-elsewhere", "Autre")).toEqual({
      ok: false,
      error: "not_active",
    });
  });
});

describe("toOwnerCanvases and pickLinkedCanvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Sépare l'actif des archives, sans champ vide ni champ interne
  it("splits the active canvas from the archives, with no empty or internal field", () => {
    const listed = toOwnerCanvases([archiveOf(1, { name: "Hiver" }), active, archiveOf(2)]);

    expect(listed.active).toEqual({ canvasId: active.canvasId, width: 50, height: 50, createdAt: 1000 });
    expect(listed.archives).toEqual([
      {
        canvasId: "canvas-archive-1",
        width: 100,
        height: 100,
        createdAt: 100,
        archivedAt: 150,
        linkCode: "code1xxxxx",
        name: "Hiver",
      },
      {
        canvasId: "canvas-archive-2",
        width: 100,
        height: 100,
        createdAt: 200,
        archivedAt: 250,
        linkCode: "code2xxxxx",
      },
    ]);
  });

  // Ne liste pas un canvas inactif sans code ni date : ce n'est pas une archive, il n'a pas de lien
  it("does not list an inactive canvas with no code nor date: it is no archive, it has no link", () => {
    const { archivedAt, linkCode, ...broken } = archiveOf(1);

    expect(toOwnerCanvases([active, broken]).archives).toEqual([]);
    expect(toOwnerCanvases([active, { ...broken, linkCode: "abcdefghij" }]).archives).toEqual([]);
    expect(toOwnerCanvases([active, { ...broken, archivedAt: 1 }]).archives).toEqual([]);
  });

  // Un propriétaire sans canvas actif : `null`, pas une erreur
  it("gives null for an owner without an active canvas, not an error", () => {
    expect(toOwnerCanvases([])).toEqual({ active: null, archives: [] });
  });

  // Un code désigne une archive, ou le canvas actif qui l'a gardé, et rien d'autre
  it("lets a code designate an archive, or the active canvas that kept it, and nothing else", () => {
    const canvases = [{ ...active, linkCode: "kept123456" }, archiveOf(1), archiveOf(2)];

    expect(pickLinkedCanvas(canvases, "code2xxxxx")).toMatchObject({
      status: "archived",
      archive: { canvasId: "canvas-archive-2", linkCode: "code2xxxxx" },
    });
    expect(pickLinkedCanvas(canvases, "kept123456")).toEqual({ status: "active" });
    expect(pickLinkedCanvas(canvases, "unknown123")).toBeNull();
  });
});

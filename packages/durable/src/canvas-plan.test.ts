import { MAX_ARCHIVES } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import {
  pickLinkedCanvas,
  planArchive,
  planDiscard,
  planNameToTheme,
  planReopen,
  planSetTheme,
  type StoredCanvas,
  toActiveCanvas,
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
  // Archive l'actif avec sa date, son code et son thème, et insère le nouveau canvas actif, né à cet instant, sans thème
  it("archives the active canvas with its date, code and theme, and inserts the new one, born at that instant, with no theme", () => {
    const plan = planArchive([active], { ...archiving, theme: "Printemps" });

    expect(plan).toEqual({
      ok: true,
      writes: [
        {
          kind: "patch",
          canvasId: active.canvasId,
          fields: { isActive: false, archivedAt: 5000, linkCode: "freshcode1", theme: "Printemps" },
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

  // Garde le code d'un canvas qui en avait un (rouvert, puis archivé de nouveau), et retire son ancien thème sans thème donné
  it("keeps the code of a canvas that had one, and drops its old theme when none is given", () => {
    const reopened = { ...active, linkCode: "oldcode123", theme: "Avant" };

    // Strict : `theme` et `name` sont là, à `undefined`, car c'est ce qui les retire du document.
    expect(planArchive([reopened], archiving)).toStrictEqual({
      ok: true,
      writes: [
        {
          kind: "patch",
          canvasId: active.canvasId,
          fields: {
            isActive: false,
            archivedAt: 5000,
            linkCode: "oldcode123",
            theme: undefined,
            name: undefined,
          },
        },
        expect.objectContaining({ kind: "insert" }),
      ],
    });
  });

  // Ancien appel (le code d'avant envoie `name`) : pris comme thème quand `theme` est absent, jamais écrit sous `name`
  it("takes the old `name` argument as the theme when `theme` is absent, and never writes it under `name`", () => {
    const named = planArchive([active], { ...archiving, name: "Printemps" });

    expect(named).toEqual(planArchive([active], { ...archiving, theme: "Printemps" }));
    expect(named).toMatchObject({
      ok: true,
      writes: [{ kind: "patch", fields: { theme: "Printemps" } }, { kind: "insert" }],
    });
    expect(named.ok && named.writes[0]).not.toHaveProperty("fields.name");
  });

  // Quand `theme` et `name` arrivent ensemble, le thème l'emporte
  it("lets `theme` win when it comes with the old `name`", () => {
    const plan = planArchive([active], { ...archiving, theme: "Neuf", name: "Ancien" });

    expect(plan).toMatchObject({ ok: true, writes: [{ fields: { theme: "Neuf" } }, { kind: "insert" }] });
  });

  // Un `theme` ou un `name` vide ne donne pas de thème : le champ part, comme sans argument
  it("gives no theme for an empty `theme` or old `name`, like without an argument", () => {
    const without = planArchive([active], archiving);

    expect(planArchive([active], { ...archiving, name: "" })).toEqual(without);
    expect(planArchive([active], { ...archiving, theme: "", name: "" })).toEqual(without);
    expect(without).toMatchObject({ writes: [{ fields: { theme: undefined, name: undefined } }, {}] });
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

  // Échange l'actif et l'archive : l'actif prend sa place, l'archive revient sans date, avec son code et son thème
  it("swaps the active canvas and the archive: the active one takes its place, the archive comes back without a date", () => {
    // Strict : l'archive qui revient ne porte ni `linkCode` ni `theme` dans ses champs, donc les garde.
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

describe("planSetTheme (Écart §8.1, JOURNAL 2026-10-07)", () => {
  // Pose le thème sur le canvas actif de ce propriétaire, rien d'autre
  it("sets the theme on the active canvas of this owner, and writes nothing else", () => {
    expect(planSetTheme([active, ...archives(2)], ownerId, active.canvasId, "Printemps")).toEqual({
      ok: true,
      writes: [{ kind: "patch", canvasId: active.canvasId, fields: { theme: "Printemps" } }],
    });
  });

  // Sans thème, le patch porte un `theme` et un `name` à `undefined` : c'est ce qui retire les champs du document
  it("removes the theme without one: the patch carries an undefined theme and name, which drops the fields", () => {
    const plan = planSetTheme([{ ...active, theme: "Printemps" }], ownerId, active.canvasId, undefined);

    expect(plan).toStrictEqual({
      ok: true,
      writes: [{ kind: "patch", canvasId: active.canvasId, fields: { theme: undefined, name: undefined } }],
    });
  });

  // Ancien appel `rename` (le code d'avant envoie `name`) : la mutation passe `name` à ce plan, qui le pose comme thème,
  // sans jamais écrire `name`, et le retire avec le thème quand il est vide
  it("serves the old `rename` call: the name becomes the theme, `name` is never written, an empty one removes both", () => {
    const withName = [{ ...active, name: "Avant" }, ...archives(2)];

    expect(planSetTheme(withName, ownerId, active.canvasId, "Après")).toStrictEqual({
      ok: true,
      writes: [{ kind: "patch", canvasId: active.canvasId, fields: { theme: "Après" } }],
    });
    expect(planSetTheme(withName, ownerId, active.canvasId, "")).toStrictEqual({
      ok: true,
      writes: [{ kind: "patch", canvasId: active.canvasId, fields: { theme: undefined, name: undefined } }],
    });
    expect(planSetTheme(withName, ownerId, "canvas-archive-2", "Après")).toEqual({
      ok: false,
      error: "not_active",
    });
  });

  // Jamais une archive, ni le canvas d'un autre propriétaire, ni un inconnu : `not_active`
  it("never sets the theme of an archive, another owner's canvas or an unknown one", () => {
    const canvases = [active, ...archives(2)];

    expect(planSetTheme(canvases, ownerId, "canvas-archive-2", "Autre")).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(planSetTheme(canvases, "owner-2", active.canvasId, "Autre")).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(planSetTheme(canvases, ownerId, "canvas-elsewhere", "Autre")).toEqual({
      ok: false,
      error: "not_active",
    });
  });
});

describe("planNameToTheme (Écart §8.1, JOURNAL 2026-10-07)", () => {
  // Ce que les documents deviennent une fois les écritures appliquées, comme `db.patch`
  const applied = (canvases: readonly StoredCanvas[]): StoredCanvas[] => {
    const plan = planNameToTheme(canvases);
    return canvases.map((canvas) => {
      const write = plan.find((each) => each.kind === "patch" && each.canvasId === canvas.canvasId);
      if (write?.kind !== "patch") return canvas;
      return { ...canvas, ...write.fields } as StoredCanvas;
    });
  };

  // Recopie l'ancien nom dans le thème vide, sur l'actif comme sur les archives, sans toucher aux autres, et ne retire
  // jamais `name` : le code d'avant l'affiche encore
  it("copies the old name into an empty theme, on the active canvas and the archives, leaving the others alone and never removing `name`", () => {
    const canvases = [{ ...active, name: "Printemps" }, archiveOf(1, { name: "Hiver" }), archiveOf(2)];

    // Strict : les champs ne portent que `theme`, aucun `name` à `undefined`, qui le retirerait.
    expect(planNameToTheme(canvases)).toStrictEqual([
      { kind: "patch", canvasId: active.canvasId, fields: { theme: "Printemps" } },
      { kind: "patch", canvasId: "canvas-archive-1", fields: { theme: "Hiver" } },
    ]);
    expect(applied(canvases)).toEqual([
      { ...active, name: "Printemps", theme: "Printemps" },
      archiveOf(1, { name: "Hiver", theme: "Hiver" }),
      archiveOf(2),
    ]);
  });

  // Un thème déjà posé l'emporte et rien n'est écrit ; un nom vide ne donne aucun thème
  it("lets a theme already set win, writing nothing; an empty name gives no theme", () => {
    const canvases = [{ ...active, name: "Ancien", theme: "Neuf" }, archiveOf(1, { name: "" })];

    expect(planNameToTheme(canvases)).toEqual([]);
    expect(applied(canvases)).toEqual(canvases);
  });

  // Un thème vide (la chaîne vide) est un thème absent : le nom y est recopié
  it("treats an empty theme as an absent one: the name is copied into it", () => {
    expect(planNameToTheme([{ ...active, name: "Printemps", theme: "" }])).toEqual([
      { kind: "patch", canvasId: active.canvasId, fields: { theme: "Printemps" } },
    ]);
  });

  // Idempotente : une fois passée, elle n'a plus rien à faire, et sur rien elle ne fait rien
  it("is idempotent: once run it has nothing left to do, and on nothing it does nothing", () => {
    const canvases = [{ ...active, name: "Printemps" }, archiveOf(1, { name: "Hiver" }), archiveOf(2)];

    expect(planNameToTheme(applied(canvases))).toEqual([]);
    expect(planNameToTheme(applied(applied(canvases)))).toEqual([]);
    expect(planNameToTheme([])).toEqual([]);
  });

  // Après elle, retirer le thème retire aussi l'ancien nom : relancée, elle ne ressortirait pas un thème qu'on a retiré
  it("cannot bring back a theme that was removed after it ran: removing the theme removes the old name too", () => {
    const migrated = applied([{ ...active, name: "Printemps" }]);
    const removal = planSetTheme(migrated, ownerId, active.canvasId, undefined);
    const afterRemoval = migrated.map((canvas) =>
      removal.ok && removal.writes[0]?.kind === "patch"
        ? ({ ...canvas, ...removal.writes[0].fields } as StoredCanvas)
        : canvas,
    );

    expect(planNameToTheme(afterRemoval)).toEqual([]);
  });
});

describe("toActiveCanvas (Écart §8.1, JOURNAL 2026-10-07)", () => {
  // Donne le canvas actif de la page avec son thème s'il en a un, sans champ vide ni champ interne
  it("gives the canvas of the page with its theme when it has one, with no empty or internal field", () => {
    expect(toActiveCanvas({ ...active, theme: "Printemps", linkCode: "kept123456" })).toEqual({
      canvasId: active.canvasId,
      width: 50,
      height: 50,
      theme: "Printemps",
    });
    expect(toActiveCanvas(active)).toStrictEqual({ canvasId: active.canvasId, width: 50, height: 50 });
    expect(toActiveCanvas({ ...active, theme: "" })).toStrictEqual({
      canvasId: active.canvasId,
      width: 50,
      height: 50,
    });
  });
});

describe("toOwnerCanvases and pickLinkedCanvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Sépare l'actif des archives, sans champ vide ni champ interne
  it("splits the active canvas from the archives, with no empty or internal field", () => {
    const listed = toOwnerCanvases([archiveOf(1, { theme: "Hiver" }), active, archiveOf(2)]);

    expect(listed.active).toEqual({ canvasId: active.canvasId, width: 50, height: 50, createdAt: 1000 });
    expect(listed.archives).toEqual([
      {
        canvasId: "canvas-archive-1",
        width: 100,
        height: 100,
        createdAt: 100,
        archivedAt: 150,
        linkCode: "code1xxxxx",
        theme: "Hiver",
        name: "Hiver", // ancien alias du thème, pour le code d'avant
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

  // Le canvas actif porte son thème, celui qu'il a reçu du streamer ou qu'une archive rouverte a gardé
  it("lets the active canvas carry its theme, the one the streamer gave it or a reopened archive kept", () => {
    expect(toOwnerCanvases([{ ...active, theme: "Printemps" }, archiveOf(1)]).active).toEqual({
      canvasId: active.canvasId,
      width: 50,
      height: 50,
      createdAt: 1000,
      theme: "Printemps",
      name: "Printemps",
    });
  });

  // Le code d'avant lit `name` pour ses titres : les listes le rendent aussi, comme alias du thème et jamais comme le champ
  // stocké, que seule la migration lit ; un canvas sans thème n'a ni l'un ni l'autre
  it("gives the old code the `name` it reads for its titles, as an alias of the theme and never the stored field", () => {
    const stored = { name: "Ancien", theme: "Neuf" };
    const listed = toOwnerCanvases([{ ...active, ...stored }, archiveOf(1, stored), archiveOf(2)]);
    const linked = pickLinkedCanvas([archiveOf(1, stored)], "code1xxxxx");

    expect(listed.active).toMatchObject({ theme: "Neuf", name: "Neuf" });
    expect(listed.archives[0]).toMatchObject({ theme: "Neuf", name: "Neuf" });
    expect(linked).toMatchObject({ status: "archived", archive: { theme: "Neuf", name: "Neuf" } });
    expect(listed.archives[1]).not.toHaveProperty("name");
    expect(toOwnerCanvases([{ ...active, name: "Ancien" }]).active).not.toHaveProperty("name");
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirstHint, type FirstHint, type FirstHintDeps } from "./first-hint";
import { type BubbleStorage, createSeenBubbles } from "./seen-bubbles";

const createFakeStorage = (): BubbleStorage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const refusing = (): BubbleStorage => ({
  getItem: () => {
    throw new Error("stockage refusé");
  },
  setItem: () => {
    throw new Error("stockage refusé");
  },
});

// Une visite : le même stockage d'une visite à l'autre, une mémoire des bulles vues neuve à chacune.
const visit = (storage: BubbleStorage, isTouchScreen = true): FirstHint => {
  const deps: FirstHintDeps = {
    seen: createSeenBubbles(() => storage),
    getStorage: () => storage,
    isTouchScreen: () => isTouchScreen,
  };
  return createFirstHint(deps);
};

describe("le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Quand rien n'a été fait sur un écran tactile, il s'ouvre sans geste fait
  it("opens with no step done on a touch screen where nothing was kept", () => {
    expect(visit(createFakeStorage()).getView()).toEqual({ status: "open", done: [] });
  });

  // Sur un PC (souris), il ne s'ouvre jamais, et rien n'est lu ni écrit
  it("never opens on a mouse screen, and reads and writes nothing", () => {
    const storage = createFakeStorage();
    const getItem = vi.spyOn(storage, "getItem");
    const hint = visit(storage, false);

    hint.record("zoom");

    expect(hint.getView()).toEqual({ status: "off" });
    expect(getItem).not.toHaveBeenCalled();
    expect(storage.entries.size).toBe(0);
  });

  // Chaque geste réussi s'ajoute dans l'ordre où il est fait, et prévient qui écoute
  it("adds each successful step in the order it was done, and tells who listens", () => {
    const hint = visit(createFakeStorage());
    const listener = vi.fn();
    hint.subscribe(listener);

    hint.record("zoom");
    hint.record("pan");

    expect(hint.getView()).toEqual({ status: "open", done: ["zoom", "pan"] });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  // Un même geste répété ne compte qu'une fois : trois déplacements ne ferment pas le conseil
  it("counts a repeated step once: three pans never close the hint", () => {
    const hint = visit(createFakeStorage());
    const listener = vi.fn();
    hint.subscribe(listener);

    hint.record("pan");
    hint.record("pan");
    hint.record("pan");

    expect(hint.getView()).toEqual({ status: "open", done: ["pan"] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // La vue ne change d'objet que quand elle change : React la compare par identité
  it("keeps the same view object until something changes", () => {
    const hint = visit(createFakeStorage());
    const first = hint.getView();

    hint.record("pan");
    const second = hint.getView();
    hint.record("pan");

    expect(second).not.toBe(first);
    expect(hint.getView()).toBe(second);
  });

  // La progression se retient d'une visite à l'autre
  it("keeps the progress from one visit to the next", () => {
    const storage = createFakeStorage();
    const first = visit(storage);
    first.record("zoom");
    first.record("inspect");

    expect(visit(storage).getView()).toEqual({ status: "open", done: ["zoom", "inspect"] });
  });

  // Le troisième geste distinct la finit, la mémorise comme vue, et elle ne revient plus
  it("finishes on the third distinct step, remembers it as seen, and never comes back", () => {
    const storage = createFakeStorage();
    const hint = visit(storage);

    hint.record("pan");
    hint.record("zoom");
    hint.record("inspect");

    expect(hint.getView()).toEqual({ status: "done" });
    expect(visit(storage).getView()).toEqual({ status: "off" });
  });

  // Une fois finie, un geste de plus ne change rien et ne prévient personne
  it("ignores a step once finished, without telling anyone", () => {
    const hint = visit(createFakeStorage());
    for (const step of ["pan", "zoom", "inspect"] as const) hint.record(step);
    const listener = vi.fn();
    hint.subscribe(listener);

    hint.record("pan");

    expect(hint.getView()).toEqual({ status: "done" });
    expect(listener).not.toHaveBeenCalled();
  });

  // Une valeur illisible dans le stockage ne casse rien : seuls les gestes connus comptent
  it("reads only the known steps of a stored value", () => {
    const storage = createFakeStorage();
    storage.setItem("liveplace:first-hint-steps", "pan,bogus,pan,,zoom");

    expect(visit(storage).getView()).toEqual({ status: "open", done: ["pan", "zoom"] });
  });

  // Sans stockage lisible, il ne s'ouvre jamais : il reviendrait à chaque visite
  it("never opens when the storage refuses to read, as it would come back on every visit", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hint = visit(refusing());

    hint.record("pan");

    expect(hint.getView()).toEqual({ status: "off" });
  });

  // Quand le stockage refuse d'écrire, il se retire pour la visite plutôt que de revenir sans mémoire
  it("steps aside for the visit when the storage refuses to write", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const lockedStorage: BubbleStorage = { getItem: () => null, setItem: refusing().setItem };
    const hint = visit(lockedStorage);
    const listener = vi.fn();
    hint.subscribe(listener);

    hint.record("pan");

    expect(hint.getView()).toEqual({ status: "off" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // Cesse de prévenir qui s'est retiré
  it("stops telling who stopped listening", () => {
    const hint = visit(createFakeStorage());
    const listener = vi.fn();
    const stop = hint.subscribe(listener);

    stop();
    hint.record("pan");

    expect(listener).not.toHaveBeenCalled();
  });
});

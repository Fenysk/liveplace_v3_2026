import type { Result } from "@liveplace/shared";
import { describe, expect, it } from "vitest";
import {
  type AccountDeletionView,
  createAccountDeletionStore,
  type DeleteAccountFailure,
} from "./account-deletion";

type Answer = Result<void, DeleteAccountFailure>;

// Un serveur que le test ouvre à la main : la réponse arrive quand on la libère, comme celle d'un effacement qui dure.
const setup = (answers: Answer[] = [{ ok: true, value: undefined }]) => {
  const requests: number[] = [];
  const left: number[] = [];
  const releases: (() => void)[] = [];
  const queue = [...answers];
  const store = createAccountDeletionStore({
    request: () => {
      requests.push(requests.length);
      return new Promise<Answer>((resolve) => {
        releases.push(() => resolve(queue.shift() ?? { ok: true, value: undefined }));
      });
    },
    leave: () => {
      left.push(left.length);
    },
  });
  const views: AccountDeletionView[] = [];
  store.subscribe(() => views.push(store.getView()));
  return { store, requests, left, views, answer: () => releases.shift()?.() };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the confirmation of the account deletion (CDC §8)", () => {
  // Fermée au départ : rien n'est demandé au serveur avant la confirmation
  it("is closed at first, and asks the server nothing until it is confirmed", () => {
    const { store, requests } = setup();

    expect(store.getView()).toEqual({ isOpen: false, status: "idle", failure: null });
    store.open();

    expect(store.getView()).toEqual({ isOpen: true, status: "idle", failure: null });
    expect(requests).toEqual([]);
  });

  // Annuler ferme sans rien demander ni rien oublier
  it("closes on cancel, asking nothing", () => {
    const { store, requests, left } = setup();
    store.open();

    store.close();

    expect(store.getView().isOpen).toBe(false);
    expect(requests).toEqual([]);
    expect(left).toEqual([]);
  });

  // Pendant l'effacement, ni Échap, ni Annuler, ni la poignée ne ferment la fenêtre
  it("cannot be closed while the deletion runs", async () => {
    const { store, answer } = setup();
    store.open();

    const confirmed = store.confirm();
    store.close();

    expect(store.getView()).toEqual({ isOpen: true, status: "running", failure: null });
    answer();
    await confirmed;
  });

  // Un double clic ne lance qu'une demande
  it("sends a single request for a double click", async () => {
    const { store, requests, answer } = setup();
    store.open();

    const first = store.confirm();
    const second = store.confirm();
    answer();
    await Promise.all([first, second]);

    expect(requests).toHaveLength(1);
  });

  // Quand la demande réussit, la page quitte les lieux, une fois, et la fenêtre reste verrouillée jusque-là
  it("leaves once the request succeeds, the window staying locked until then", async () => {
    const { store, left, answer } = setup();
    store.open();

    const confirmed = store.confirm();
    expect(left).toEqual([]);
    answer();
    await confirmed;

    expect(left).toHaveLength(1);
    expect(store.getView()).toEqual({ isOpen: true, status: "running", failure: null });
  });

  // Une erreur avant l'inscription : la fenêtre reste ouverte et le dit, la page ne part pas, le compte reste
  it("stays open and says why when the request fails, and the page does not leave", async () => {
    const { store, left, answer } = setup([{ ok: false, error: "failed" }]);
    store.open();

    const confirmed = store.confirm();
    answer();
    await confirmed;

    expect(store.getView()).toEqual({ isOpen: true, status: "failed", failure: "failed" });
    expect(left).toEqual([]);
  });

  // Après un échec, on peut fermer, ou réessayer : la demande repart et réussit
  it("can be closed after a failure, or tried again until it succeeds", async () => {
    const { store, requests, left, answer } = setup([
      { ok: false, error: "network" },
      { ok: true, value: undefined },
    ]);
    store.open();
    const first = store.confirm();
    answer();
    await first;

    const second = store.confirm();
    expect(store.getView().status).toBe("running");
    answer();
    await second;

    expect(requests).toHaveLength(2);
    expect(left).toHaveLength(1);
  });

  // Fermée après un échec, la fenêtre rouvre propre : plus de message de l'essai d'avant
  it("opens clean again after a failure was closed", async () => {
    const { store, answer } = setup([{ ok: false, error: "unauthenticated" }]);
    store.open();
    const confirmed = store.confirm();
    answer();
    await confirmed;

    store.close();
    store.open();

    expect(store.getView()).toEqual({ isOpen: true, status: "idle", failure: null });
  });

  // Rien ne se confirme sans fenêtre ouverte
  it("confirms nothing when it is not open", async () => {
    const { store, requests } = setup();

    await store.confirm();
    await flush();

    expect(requests).toEqual([]);
  });

  // Les abonnés sont prévenus à chaque changement, et plus après s'être désabonnés
  it("tells its subscribers of each change, and no more after they unsubscribe", async () => {
    const { store, views, answer } = setup();
    const heard: string[] = [];
    const unsubscribe = store.subscribe(() => heard.push(store.getView().status));

    store.open();
    const confirmed = store.confirm();
    unsubscribe();
    answer();
    await confirmed;

    expect(heard).toEqual(["idle", "running"]);
    expect(views.length).toBeGreaterThanOrEqual(2);
  });
});

import type { AuthoredPixel } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import type { RequestResult } from "../../state/canvas-store";
import { createPixelListing } from "./pixel-listing";

type Reply = RequestResult<AuthoredPixel[]>;

const pixelsOf = (x: number): AuthoredPixel[] => [{ x, y: 0, colorIndex: 4 }];

// Une lecture qu'on termine à la main : `answer(n, reply)` rend la n-ième lancée.
const setup = () => {
  const answers: ((reply: Reply) => void)[] = [];
  const shown: (readonly AuthoredPixel[] | null)[] = [];
  const failures: string[] = [];
  const listing = createPixelListing((pixels) => shown.push(pixels));
  const read = () => new Promise<Reply>((resolve) => answers.push(resolve));
  const list = (): void => listing.list(read(), (error) => failures.push(error));
  const answer = async (index: number, reply: Reply): Promise<void> => {
    answers[index]?.(reply);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { list, drop: listing.drop, answer, shown: () => shown.at(-1), failures };
};

describe("createPixelListing (audit du code du 06/10)", () => {
  // Une lecture seule : l'aperçu se vide au départ, puis montre la réponse
  it("shows nothing while it loads, then the reply", async () => {
    const { list, answer, shown } = setup();

    list();
    expect(shown()).toBeNull();

    await answer(0, { ok: true, value: pixelsOf(1) });
    expect(shown()).toEqual(pixelsOf(1));
  });

  // Une réponse en échec montre une liste vide et le dit, avec son erreur
  it("shows an empty list and reports the error when the read fails", async () => {
    const { list, answer, shown, failures } = setup();

    list();
    await answer(0, { ok: false, error: "closed" });

    expect(shown()).toEqual([]);
    expect(failures).toEqual(["closed"]);
  });

  // La cible change pendant le chargement : la réponse de l'ancienne, arrivée après la nouvelle, ne s'affiche jamais
  it("ignores the reply of a replaced read that arrives after the new one", async () => {
    const { list, answer, shown } = setup();
    list();
    list();

    await answer(1, { ok: true, value: pixelsOf(2) });
    await answer(0, { ok: true, value: pixelsOf(1) });

    expect(shown()).toEqual(pixelsOf(2));
  });

  // La réponse de l'ancienne arrive avant celle de la nouvelle : l'aperçu attend la nouvelle, sans montrer l'ancienne
  it("ignores the reply of a replaced read that arrives before the new one", async () => {
    const { list, answer, shown } = setup();
    list();
    list();

    await answer(0, { ok: true, value: pixelsOf(1) });
    expect(shown()).toBeNull();

    await answer(1, { ok: true, value: pixelsOf(2) });
    expect(shown()).toEqual(pixelsOf(2));
  });

  // Même cible rouverte : la lecture d'avant est tout autant remplacée, elle n'a pas le droit de répondre
  it("ignores the reply of an earlier read of the same target", async () => {
    const { list, answer, shown } = setup();
    list();
    list();

    await answer(0, { ok: true, value: pixelsOf(1) });

    expect(shown()).toBeNull();
  });

  // Une lecture remplacée qui échoue ne dit rien : son échec ne concerne plus personne
  it("does not report the failure of a replaced read", async () => {
    const { list, answer, shown, failures } = setup();
    list();
    list();

    await answer(0, { ok: false, error: "closed" });
    await answer(1, { ok: true, value: pixelsOf(2) });

    expect(failures).toEqual([]);
    expect(shown()).toEqual(pixelsOf(2));
  });

  // Fermer ou démonter pendant le chargement : aucune réponse n'arrive plus à l'écran, ni son échec
  it("ignores the reply, and the failure, of a read dropped while it loads", async () => {
    const { list, drop, answer, shown, failures } = setup();
    list();
    list();
    drop();

    await answer(0, { ok: true, value: pixelsOf(1) });
    await answer(1, { ok: false, error: "closed" });

    expect(shown()).toBeNull();
    expect(failures).toEqual([]);
  });

  // Après un abandon, la lecture suivante répond normalement
  it("answers a new read after one was dropped", async () => {
    const { list, drop, answer, shown } = setup();
    list();
    drop();
    list();

    await answer(0, { ok: true, value: pixelsOf(1) });
    expect(shown()).toBeNull();

    await answer(1, { ok: true, value: pixelsOf(2) });
    expect(shown()).toEqual(pixelsOf(2));
  });
});

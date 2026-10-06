import { describe, expect, it } from "vitest";
import { oneAtATime } from "./one-at-a-time";

// Une lecture qu'on termine à la main : `finish(n)` rend la n-ième lancée.
const setup = () => {
  const finishers: (() => void)[] = [];
  const relist = oneAtATime(
    () =>
      new Promise<void>((resolve) => {
        finishers.push(resolve);
      }),
  );
  const finish = async (index: number): Promise<void> => {
    finishers[index]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { relist, finish, started: () => finishers.length };
};

describe("oneAtATime (JOURNAL 2026-10-06)", () => {
  // Une demande lance la lecture ; celles qui tombent pendant qu'elle court n'en lancent pas une deuxième
  it("starts a read on the first ask, and none while it runs", () => {
    const { relist, started } = setup();

    relist();
    relist();
    relist();

    expect(started()).toBe(1);
  });

  // Tout ce qui a été demandé pendant la lecture ne coûte qu'une lecture de plus, à sa fin
  it("reads once more, when the read ends, for everything asked meanwhile", async () => {
    const { relist, finish, started } = setup();
    relist();
    relist();
    relist();

    await finish(0);
    expect(started()).toBe(2);

    await finish(1);
    expect(started()).toBe(2);
  });

  // Rien demandé pendant la lecture : aucune lecture de plus, et une nouvelle demande repart
  it("reads no more when nothing was asked meanwhile, and starts again on the next ask", async () => {
    const { relist, finish, started } = setup();
    relist();

    await finish(0);
    expect(started()).toBe(1);

    relist();
    expect(started()).toBe(2);
  });
});

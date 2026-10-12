import { describe, expect, it } from "vitest";
import { BUBBLE_LINGER_MS } from "./help-bubbles";
import { createShownBubble, type ShownBubbleClock } from "./shown-bubble";

const FADE_MS = 200;

// Une horloge qu'on avance à la main : les attentes échues partent dans l'ordre, celles qu'elles lancent aussi, sans rien attendre.
const fakeClock = () => {
  let now = 0;
  const waits: { at: number; run: () => void; isCancelled: boolean }[] = [];
  const clock: ShownBubbleClock = {
    wait(ms, run) {
      const wait = { at: now + ms, run, isCancelled: false };
      waits.push(wait);
      return () => {
        wait.isCancelled = true;
      };
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = waits
        .filter((wait) => !wait.isCancelled && wait.at <= end)
        .sort((first, second) => first.at - second.at)[0];
      if (!due) break;
      now = due.at;
      due.isCancelled = true;
      due.run();
    }
    now = end;
  };
  return { clock, advance, pendingCount: () => waits.filter((wait) => !wait.isCancelled).length };
};

const setup = () => {
  const { clock, advance, pendingCount } = fakeClock();
  const bubble = createShownBubble({ clock, fadeMs: () => FADE_MS });
  // Une bulle montrée : demandée, le fondu de ce qui était là passé.
  const show = (wanted: "first-draft" | "empty-gauge" | "first-reward") => {
    bubble.follow(wanted, false);
    advance(FADE_MS);
  };
  return { bubble, advance, show, pendingCount };
};

describe("la bulle d'aide à l'écran (Écart §8.1, JOURNAL 2026-10-08 et 2026-10-12)", () => {
  // Rien à l'écran : la bulle voulue paraît après le temps d'un fondu, jamais avant
  it("shows the wanted bubble once a fade has passed, never before", () => {
    const { bubble, advance } = setup();

    bubble.follow("empty-gauge", false);
    expect(bubble.getShown()).toBeUndefined();
    advance(FADE_MS - 1);
    expect(bubble.getShown()).toBeUndefined();
    advance(1);
    expect(bubble.getShown()).toBe("empty-gauge");
  });

  // Une autre bulle voulue : celle qui est là s'efface aussitôt, la nouvelle paraît après le fondu : jamais deux à l'écran
  it("hides the bubble that is no longer wanted at once, and shows the next after a fade", () => {
    const { bubble, advance, show } = setup();
    show("first-reward");

    bubble.follow("empty-gauge", false);
    expect(bubble.getShown()).toBeUndefined();
    advance(FADE_MS);
    expect(bubble.getShown()).toBe("empty-gauge");
  });

  // Plus aucune bulle voulue : elle s'efface aussitôt, comme avant
  it("hides at once a bubble nothing asks for any more", () => {
    const { bubble, show } = setup();
    show("first-reward");

    bubble.follow(undefined, false);
    expect(bubble.getShown()).toBeUndefined();
  });

  // Close mais qui reste : elle garde sa place le temps d'être lue, et aucune autre ne paraît pendant ce temps
  it("keeps a closed bubble that lingers for the linger time, with no other one shown meanwhile", () => {
    const { bubble, advance, show } = setup();
    show("first-draft");

    bubble.follow("empty-gauge", true);
    expect(bubble.getShown()).toBe("first-draft");
    advance(BUBBLE_LINGER_MS - 1);
    expect(bubble.getShown()).toBe("first-draft");
    advance(1);
    expect(bubble.getShown()).toBeUndefined();
    advance(FADE_MS - 1);
    expect(bubble.getShown()).toBeUndefined();
    advance(1);
    expect(bubble.getShown()).toBe("empty-gauge");
  });

  // Sans autre bulle voulue, elle part en fondu à la fin du temps, et rien ne reparaît
  it("lets a lingering bubble go at the end of the linger time when nothing else is wanted", () => {
    const { bubble, advance, show } = setup();
    show("empty-gauge");

    bubble.follow(undefined, true);
    advance(BUBBLE_LINGER_MS);
    expect(bubble.getShown()).toBeUndefined();
    advance(10 * FADE_MS);
    expect(bubble.getShown()).toBeUndefined();
  });

  // Sa cible quitte l'écran (sortie du Dessin, fenêtre ouverte) : elle part tout de suite, sans finir son temps
  it("drops a lingering bubble at once when what it points at leaves the screen", () => {
    const { bubble, advance, show } = setup();
    show("first-draft");
    bubble.follow(undefined, true);
    advance(BUBBLE_LINGER_MS / 2);
    expect(bubble.getShown()).toBe("first-draft");

    bubble.follow(undefined, false);
    expect(bubble.getShown()).toBeUndefined();
  });

  // Un autre souhait pendant son temps ne le repousse pas : la fin reste celle de la première attente
  it("does not push back the end of the linger when another bubble is wanted meanwhile", () => {
    const { bubble, advance, show } = setup();
    show("first-draft");
    bubble.follow("empty-gauge", true);
    advance(BUBBLE_LINGER_MS / 2);

    bubble.follow("first-reward", true);
    advance(BUBBLE_LINGER_MS / 2);
    expect(bubble.getShown()).toBeUndefined();
    advance(FADE_MS);
    expect(bubble.getShown()).toBe("first-reward");
  });

  // Voulue de nouveau pendant son temps (le brouillon vidé) : elle reste, et son attente est annulée
  it("keeps the bubble, with no end to wait for, when it is wanted again during the linger", () => {
    const { bubble, advance, show, pendingCount } = setup();
    show("first-draft");
    bubble.follow(undefined, true);
    advance(BUBBLE_LINGER_MS / 2);

    bubble.follow("first-draft", false);
    advance(2 * BUBBLE_LINGER_MS);
    expect(bubble.getShown()).toBe("first-draft");
    expect(pendingCount()).toBe(0);
  });

  // Les abonnés (la page) sont prévenus à chaque changement, et à ceux-là seulement
  it("tells its subscribers at each change, and stops when one unsubscribes", () => {
    const { bubble, advance } = setup();
    let calls = 0;
    const unsubscribe = bubble.subscribe(() => {
      calls += 1;
    });

    bubble.follow("empty-gauge", false);
    advance(FADE_MS);
    expect(calls).toBe(1);
    bubble.follow(undefined, false);
    expect(calls).toBe(2);
    unsubscribe();
    bubble.follow("empty-gauge", false);
    advance(FADE_MS);
    expect(calls).toBe(2);
  });

  // La page qui se ferme n'attend plus rien
  it("waits for nothing once disposed", () => {
    const { bubble, advance, show, pendingCount } = setup();
    show("first-draft");
    bubble.follow("empty-gauge", true);
    expect(pendingCount()).toBe(1);

    bubble.dispose();
    expect(pendingCount()).toBe(0);
    advance(BUBBLE_LINGER_MS + FADE_MS);
    expect(bubble.getShown()).toBe("first-draft");
  });
});

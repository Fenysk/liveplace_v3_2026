import type { InspectEntry } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import type { Inspection } from "../../state/canvas-store";
import {
  NOTHING_SHOWN,
  type PillContent,
  type PillState,
  type ShownInspection,
  toPillState,
} from "./pill-content";

const entry: InspectEntry = {
  userId: "3",
  login: "troll42",
  displayName: "Troll42",
  colorIndex: 5,
  placedAt: 1_700_000_000_000,
  placementId: "pdemo0001",
};

const loading: Inspection = { status: "loading", x: 12, y: 40 };
const found: ShownInspection = { status: "found", x: 12, y: 40, entry };
const empty: ShownInspection = { status: "empty", x: 3, y: 7 };

const skeleton: PillContent = { kind: "skeleton", x: 12, y: 40 };
const shownSkeleton: PillState = { content: skeleton, isVisible: true };
const cellOf = (inspection: ShownInspection, isAfterSkeleton = false): PillContent => ({
  kind: "cell",
  inspection,
  isAfterSkeleton,
});

describe("la pill Inspection pendant l'attente de la réponse", () => {
  // Tant que l'attente dure moins de 200 ms, la pill reste fermée : une réponse rapide ouvre la pill avec son contenu
  it("stays closed while the wait is shorter than the delay", () => {
    const waiting = toPillState(loading, false, NOTHING_SHOWN);

    expect(waiting.isVisible).toBe(false);
    expect(toPillState(found, false, waiting)).toEqual({ content: cellOf(found), isVisible: true });
  });

  // Quand l'attente dépasse 200 ms, la pill s'ouvre avec un squelette, aux coordonnées de la case touchée
  it("opens on a skeleton at the coordinates of the touched cell once the delay has passed", () => {
    expect(toPillState(loading, true, NOTHING_SHOWN)).toEqual(shownSkeleton);
  });

  // Quand la réponse arrive après que le squelette s'est vu, la case le remplace en fondu
  it("brings the cell in with a fade when it replaces a skeleton that was seen", () => {
    expect(toPillState(found, false, shownSkeleton)).toEqual({
      content: cellOf(found, true),
      isVisible: true,
    });
    expect(toPillState(empty, false, shownSkeleton)).toEqual({
      content: cellOf(empty, true),
      isVisible: true,
    });
  });

  // Quand la réponse arrive alors que le squelette ne s'était pas encore vu, la case paraît seule
  it("brings the cell in alone when the skeleton was never seen", () => {
    const unseen: PillState = { content: skeleton, isVisible: false };

    expect(toPillState(found, false, unseen)).toEqual({ content: cellOf(found), isVisible: true });
  });

  // Le fondu tient tant que la même case est montrée, et ne passe pas à la case suivante
  it("keeps the fade for the same cell only", () => {
    const faded: PillState = { content: cellOf(found, true), isVisible: true };

    expect(toPillState(found, false, faded)).toEqual(faded);
    expect(toPillState(empty, false, faded)).toEqual({ content: cellOf(empty), isVisible: true });
  });

  // Tant que la pill montre une case, en toucher une autre ne la remplace pas par un squelette
  it("keeps the cell it shows while another one is awaited", () => {
    const open: PillState = { content: cellOf(found), isVisible: true };

    expect(toPillState({ status: "loading", x: 1, y: 1 }, true, open)).toEqual(open);
    expect(toPillState({ status: "loading", x: 1, y: 1 }, false, open)).toEqual(open);
  });

  // Tant que la pill montre un squelette, toucher une autre case le garde
  it("keeps the skeleton it shows while another cell is awaited", () => {
    expect(toPillState({ status: "loading", x: 1, y: 1 }, true, shownSkeleton)).toEqual(shownSkeleton);
  });

  // Quand la pill vient de se fermer, une nouvelle attente courte ne change rien à ce qu'elle emporte en s'effaçant
  it("does not swap what a closing pill carries while the next wait is still short", () => {
    const closing: PillState = { content: cellOf(found), isVisible: false };

    expect(toPillState(loading, false, closing)).toEqual(closing);
    expect(toPillState(loading, true, closing)).toEqual(shownSkeleton);
  });

  // Quand l'inspection se ferme (clic dans le vide, gateway qui refuse), la pill s'efface avec ce qu'elle montrait
  it("fades out with what it showed when the inspection closes", () => {
    const open: PillState = { content: cellOf(found), isVisible: true };

    expect(toPillState(null, false, open)).toEqual({ content: cellOf(found), isVisible: false });
    expect(toPillState(null, true, shownSkeleton)).toEqual({ content: skeleton, isVisible: false });
    expect(toPillState(null, false, NOTHING_SHOWN)).toEqual(NOTHING_SHOWN);
  });
});

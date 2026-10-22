// L'état de la démo de l'accueil, côté React : les transitions de `home-demo.ts` appliquées à l'instant du geste.
// Rien ne part au réseau : tout reste dans cette page (Écart §9.1, JOURNAL 2026-10-22).

import { useMemo, useRef, useState } from "react";
import {
  type DemoState,
  initialDemo,
  type LaunchedPixel,
  landPixels,
  pickColor,
  sendDraft,
  takeOver,
  touchCell,
} from "./home-demo";
import { applyStep, type DemoStep } from "./home-script";

export type DemoActions = {
  // Les gestes du visiteur : le premier arrête la démo seule.
  visitorTouch: (cell: number) => void;
  visitorPick: (colorIndex: number) => void;
  visitorSend: () => readonly LaunchedPixel[];
  // Un pas de la démo seule.
  play: (step: DemoStep) => readonly LaunchedPixel[];
  land: (pixel: LaunchedPixel) => void;
  read: () => DemoState;
};

export const useHomeDemo = (): { state: DemoState; actions: DemoActions } => {
  const [state, setState] = useState(initialDemo);
  const latest = useRef(state);
  const actions = useMemo<DemoActions>(() => {
    const commit = (next: DemoState): void => {
      latest.current = next;
      setState(next);
    };
    return {
      visitorTouch: (cell) => commit(touchCell(takeOver(latest.current), cell, Date.now())),
      visitorPick: (colorIndex) => commit(pickColor(takeOver(latest.current), colorIndex)),
      visitorSend: () => {
        const sent = sendDraft(takeOver(latest.current), Date.now());
        commit(sent.state);
        return sent.launched;
      },
      play: (step) => {
        const played = applyStep(latest.current, step, Date.now());
        commit(played.state);
        return played.launched;
      },
      land: (pixel) => commit(landPixels(latest.current, [pixel])),
      read: () => latest.current,
    };
  }, []);
  return { state, actions };
};

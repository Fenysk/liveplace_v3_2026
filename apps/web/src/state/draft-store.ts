// Le mode Dessin (CDC 2026, écart §9.3, JOURNAL 2026-09-24) : le mode, le brouillon, la couleur active, le tracé et l'envoi.
// Séparé du store du canvas : la vue OBS partagera celui-là, et elle n'a pas de brouillon.

import { type Timestamp, TRANSPARENT_COLOR_INDEX, toStateOffset } from "@liveplace/domain";
import type { CanvasStore } from "./canvas-store";
import {
  type Draft,
  type DraftContext,
  type DraftEdit,
  discardDraftCell,
  EMPTY_DRAFT,
  fitDraft,
  settleBatch,
  toBatches,
  toggleDraftCell,
  traceDraftCells,
} from "./draft";
import { predictGauge } from "./gauge";
import { INITIAL_RECENT_COLOR_INDEXES, rememberColorIndex } from "./recent-color-indexes";
import { type DraftStorage, getSavedDraft, saveDraft } from "./saved-draft";

export type DraftMode = "view" | "draft";

export type DraftView = {
  mode: DraftMode;
  draft: Draft;
  colorIndex: number; // la couleur active, TRANSPARENT_COLOR_INDEX pour la gomme
  isSending: boolean; // la pill est verrouillée jusqu'au dernier ack ou à la coupure
  isTracing: boolean;
  isTouchTracing: boolean; // le Toggle tracé : un doigt trace, deux doigts déplacent
  isPicking: boolean; // la pipette armée : le prochain clic prend une couleur (CDC 2026, `I`)
  shakeCount: number; // +1 à chaque fois que la jauge doit vibrer
  recentColorIndexes: readonly number[]; // sur mobile, la rangée : cinq couleurs, jamais celle du bouton (design system)
};

export type DraftStore = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): DraftView;
  enterDraftMode(): void;
  exitDraftMode(): void; // le brouillon est gardé
  discardDraft(): void;
  selectColor(colorIndex: number): void; // dans la palette ou la rangée : celle qu'elle remplace va dans la rangée
  toggleEraser(): void; // `E` : la gomme, puis retour à la dernière couleur
  togglePicker(): void; // `I` : la pipette, pour un seul clic
  toggleCell(x: number, y: number): void;
  discardCell(x: number, y: number): void;
  startTrace(): void;
  traceCells(cells: readonly { x: number; y: number }[]): void;
  endTrace(): void;
  toggleTouchTracing(): void;
  submit(): Promise<void>;
  dispose(): void;
};

// Injectée pour les tests : l'heure, et l'attente entre deux lots.
export type DraftClock = { now(): Timestamp; wait(ms: number): Promise<void> };

const FIRST_COLOR_INDEX = TRANSPARENT_COLOR_INDEX + 1;
const SEND_INTERVAL_MS = 1000 / 8; // 8 frames `place` par seconde au plus (§6.3)

// Écart §5.1 (JOURNAL 2026-09-28) : une pose par validation ; une lettre d'abord, jamais confondue avec une version.
const randomPlacementId = (): string => `p${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`;

export function createDraftStore(
  canvasId: string,
  canvas: CanvasStore,
  getStorage: () => DraftStorage,
  clock: DraftClock,
): DraftStore {
  let view: DraftView = {
    mode: "view",
    draft: EMPTY_DRAFT,
    colorIndex: FIRST_COLOR_INDEX,
    isSending: false,
    isTracing: false,
    isTouchTracing: false,
    isPicking: false,
    shakeCount: 0,
    recentColorIndexes: INITIAL_RECENT_COLOR_INDEXES,
  };
  let lastColorIndex = FIRST_COLOR_INDEX;
  let loadedUserId: string | undefined;
  let hasShakenThisTrace = false;
  const listeners = new Set<() => void>();

  const publish = (next: Partial<DraftView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  const leaveDraftMode = (): void =>
    publish({ mode: "view", isTracing: false, isTouchTracing: false, isPicking: false });

  // Le brouillon d'un utilisateur ne se lit qu'après le `welcome` : c'est lui qui donne le `userId`.
  const applySavedDraft = (): void => {
    const { userId, status, width, height, palette } = canvas.getView();
    if (!userId || status !== "live" || userId === loadedUserId) return;
    loadedUserId = userId;
    const bounds = { width, height, paletteSize: palette.length };
    publish({ draft: getSavedDraft(getStorage, canvasId, userId, bounds) });
  };
  // Écart §10.2 (JOURNAL 2026-09-25) : un banni sort du Dessin, son brouillon reste sauvegardé.
  const leaveIfBanned = (): void => {
    if (canvas.getView().isBanned && view.mode === "draft") leaveDraftMode();
  };
  // Écart §5.3 (JOURNAL 2026-09-29) : le canvas a rétréci, ce qui sort du cadre quitte le brouillon.
  const fitToCanvas = (): void => {
    const { width, height } = canvas.getView();
    if (width > 0 && loadedUserId) setDraft(fitDraft(view.draft, { width, height }));
  };
  const unsubscribe = canvas.subscribe(() => {
    applySavedDraft();
    leaveIfBanned();
    fitToCanvas();
  });
  applySavedDraft();

  const setDraft = (draft: Draft): void => {
    if (draft === view.draft) return;
    publish({ draft });
    if (loadedUserId) saveDraft(getStorage, canvasId, loadedUserId, draft);
  };

  const context = (): DraftContext => {
    const { gauge, params, pixels, width } = canvas.getView();
    const charges = gauge && params ? predictGauge(gauge, params, clock.now()).charges : 0;
    return { charges, colorIndexAt: (x, y) => pixels[toStateOffset(x, y, width)] ?? TRANSPARENT_COLOR_INDEX };
  };

  // Le brouillon ne bouge qu'en Dessin, et jamais pendant l'envoi.
  const isEditable = () => view.mode === "draft" && !view.isSending;

  // Gomme armée, la couleur remplacée est celle d'avant la gomme : aucune ne se perd.
  const selectColor = (colorIndex: number): void => {
    const recentColorIndexes = rememberColorIndex(view.recentColorIndexes, lastColorIndex, colorIndex);
    if (colorIndex !== TRANSPARENT_COLOR_INDEX) lastColorIndex = colorIndex;
    publish({ colorIndex, recentColorIndexes, isPicking: false });
  };

  // CDC 2026, `I` : la couleur réellement posée, jamais celle du brouillon. Sur un pixel transparent, rien ne change
  // et la pipette reste armée ; sinon elle sort de la gomme, et la couleur devient celle que `E` retrouve.
  const pickColorAt = (x: number, y: number): void => {
    const colorIndex = context().colorIndexAt(x, y);
    if (colorIndex !== TRANSPARENT_COLOR_INDEX) selectColor(colorIndex);
  };

  const applyEdit = (edit: DraftEdit, canShake: boolean): void => {
    setDraft(edit.draft);
    if (edit.isCapped && canShake) publish({ shakeCount: view.shakeCount + 1 });
  };

  // Un lot à la fois, après l'ack du précédent, jamais plus de 8 par seconde. Tous portent la pose de la validation.
  const sendBatches = async (): Promise<void> => {
    const placementId = randomPlacementId();
    let lastSentAt = Number.NEGATIVE_INFINITY;
    for (const batch of toBatches(view.draft)) {
      const delay = lastSentAt + SEND_INTERVAL_MS - clock.now();
      if (delay > 0) await clock.wait(delay);
      lastSentAt = clock.now();
      const result = await canvas.placeBatch(batch, placementId);
      // Coupure ou refus du gateway : ce qui n'est pas confirmé reste dans le brouillon.
      if (!result.ok) return;
      setDraft(settleBatch(view.draft, batch, result.value));
      if (canvas.getView().isBanned) return;
    }
  };

  const submit = async (): Promise<void> => {
    const { status, isBanned } = canvas.getView();
    if (view.isSending || view.draft.size === 0 || status !== "live" || isBanned) return;
    publish({ isSending: true });
    try {
      await sendBatches();
    } finally {
      publish({ isSending: false });
    }
    // Tout est posé : retour en Vue (CDC 2026). Des refus restent, ils restent visibles en Dessin.
    if (view.draft.size === 0) leaveDraftMode();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    enterDraftMode() {
      const { userId, isBanned } = canvas.getView();
      if (isBanned) return;
      // Un invité n'entre jamais en Dessin : la pill Dessin lui montre déjà l'invitation (CDC 2026).
      if (userId && !view.isSending) publish({ mode: "draft" });
    },
    exitDraftMode() {
      if (!view.isSending) leaveDraftMode();
    },
    discardDraft() {
      if (isEditable()) setDraft(EMPTY_DRAFT);
    },
    selectColor,
    toggleEraser() {
      if (view.colorIndex === TRANSPARENT_COLOR_INDEX)
        publish({ colorIndex: lastColorIndex, isPicking: false });
      else selectColor(TRANSPARENT_COLOR_INDEX);
    },
    togglePicker() {
      if (view.mode === "draft") publish({ isPicking: !view.isPicking });
    },
    toggleCell(x, y) {
      if (view.mode === "draft" && view.isPicking) return pickColorAt(x, y);
      if (isEditable())
        applyEdit(toggleDraftCell(view.draft, { x, y, colorIndex: view.colorIndex }, context()), true);
    },
    discardCell(x, y) {
      if (isEditable()) setDraft(discardDraftCell(view.draft, x, y));
    },
    startTrace() {
      if (!isEditable() || view.isTracing || view.isPicking) return;
      hasShakenThisTrace = false;
      publish({ isTracing: true });
    },
    // Le plafond atteint pendant un tracé ne fait vibrer la jauge qu'une fois (CDC 2026).
    traceCells(cells) {
      if (!isEditable() || !view.isTracing) return;
      const pixels = cells.map(({ x, y }) => ({ x, y, colorIndex: view.colorIndex }));
      const edit = traceDraftCells(view.draft, pixels, context());
      applyEdit(edit, !hasShakenThisTrace);
      if (edit.isCapped) hasShakenThisTrace = true;
    },
    endTrace() {
      if (view.isTracing) publish({ isTracing: false });
    },
    toggleTouchTracing() {
      if (view.mode === "draft") publish({ isTouchTracing: !view.isTouchTracing });
    },
    submit,
    dispose: unsubscribe,
  };
}

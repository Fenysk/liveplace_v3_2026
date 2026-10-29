// Le mode Dessin (CDC 2026, écart §9.3, JOURNAL 2026-09-24) : le mode, le brouillon, la couleur active, le tracé et l'envoi.
// Séparé du store du canvas : la vue OBS partagera celui-là, et elle n'a pas de brouillon.

import {
  type CanvasOrigin,
  originShift,
  START_ORIGIN,
  type Timestamp,
  TRANSPARENT_COLOR_INDEX,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type { CanvasStore, Pixel } from "./canvas-store";
import {
  type Draft,
  type DraftContext,
  type DraftEdit,
  discardDraftCell,
  EMPTY_DRAFT,
  fitDraft,
  settleBatch,
  shiftBatch,
  shiftDraft,
  toBatches,
  toggleDraftCell,
  traceDraftCells,
} from "./draft";
import {
  type DraftHistory,
  type DraftTravel,
  EMPTY_DRAFT_HISTORY,
  recordDraftStep,
  redoDraftStep,
  undoDraftStep,
} from "./draft-history";
import { predictGauge } from "./gauge";
import { INITIAL_RECENT_COLOR_INDEXES, rememberColorIndex } from "./recent-color-indexes";
import { type DraftStorage, getSavedDraft, isSavedDraftStale, saveDraft } from "./saved-draft";

export type DraftMode = "view" | "draft";

export type DraftView = {
  mode: DraftMode;
  draft: Draft;
  colorIndex: number; // la couleur active, TRANSPARENT_COLOR_INDEX pour la gomme
  isSending: boolean; // la pill est verrouillée jusqu'au dernier ack ou à la coupure
  isTracing: boolean;
  isTouchTracing: boolean; // le Toggle tracé, en Dessin seulement : un doigt trace, deux doigts déplacent
  isPicking: boolean; // la pipette armée : le prochain clic prend une couleur (CDC 2026, `I`)
  shakeCount: number; // +1 à chaque fois que la jauge doit vibrer
  recentColorIndexes: readonly number[]; // sur mobile, la rangée : cinq couleurs, jamais celle du bouton (design system)
  canUndo: boolean; // l'historique a une étape à annuler : le bouton Annuler (CDC 2026, §8 Historique)
  canRedo: boolean; // l'historique a une étape à rétablir : le bouton Rétablir
};

export type DraftStore = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): DraftView;
  enterDraftMode(): void;
  exitDraftMode(): void; // le brouillon est gardé
  discardDraft(): Draft | undefined; // Vider : rend le brouillon vidé (`undefined` s'il n'y avait rien à vider), de quoi le rétablir
  restoreDraft(cleared: Draft): void; // Rétablir, dans le toast de Vider : seulement tant que Vider est la dernière étape
  // Écart §5.3 (JOURNAL 2026-10-24) : des pixels ont changé de case, le brouillon (non vide) est effacé, sans rétablissement possible.
  // Un simple décalage de la fresque (JOURNAL 2026-10-28) ne l'efface pas : ses cases suivent.
  listenWiped(listener: () => void): () => void;
  selectColor(colorIndex: number): void; // dans la palette ou la rangée : celle qu'elle remplace va dans la rangée
  selectRecentColor(slot: number): void; // les touches 1 à 5 : la récente de cette place, comme un clic sur elle
  toggleEraser(): void; // `E` : la gomme, puis retour à la dernière couleur
  togglePicker(): void; // `I` : la pipette, pour un seul clic
  toggleCell(x: number, y: number): void;
  discardCell(x: number, y: number): void;
  startTrace(): void;
  traceCells(cells: readonly { x: number; y: number }[]): void;
  endTrace(): void;
  toggleTouchTracing(): void;
  undo(): void; // Ctrl+Z : le brouillon d'avant la dernière étape (CDC 2026, §8 Historique)
  redo(): void; // Ctrl+Maj+Z, Ctrl+Y : ce que Ctrl+Z vient de défaire
  submit(): Promise<void>;
  dispose(): void;
};

// Injectée pour les tests : l'heure, et l'attente entre deux lots.
export type DraftClock = { now(): Timestamp; wait(ms: number): Promise<void> };

const FIRST_COLOR_INDEX = TRANSPARENT_COLOR_INDEX + 1;
const SEND_INTERVAL_MS = 1000 / 8; // 8 frames `place` par seconde au plus (§6.3)

// §5.1 : une pose par validation ; une lettre d'abord, jamais confondue avec une version.
const randomPlacementId = (): string => `p${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`;

// Du store du canvas, ce que le brouillon lit et appelle : un ajout au store n'a pas à toucher ses tests.
export type DraftCanvas = Pick<CanvasStore, "subscribe" | "getView" | "placeBatch">;

// `onPlaced` : tout le brouillon vient d'être posé (Écart §8.1, JOURNAL 2026-10-12), de quoi compter les dessins de l'appareil.
export function createDraftStore(
  canvasId: string,
  canvas: DraftCanvas,
  getStorage: () => DraftStorage,
  clock: DraftClock,
  onPlaced?: () => void,
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
    canUndo: false,
    canRedo: false,
  };
  let lastColorIndex = FIRST_COLOR_INDEX;
  // Écart §9.3 (JOURNAL 2026-10-08) : gardé d'un Dessin au suivant, pas au rechargement ; la vue ne le porte qu'en Dessin.
  let isTouchTracingRemembered = false;
  let loadedUserId: string | undefined;
  let hasShakenThisTrace = false;
  // CDC 2026, §8 Historique : en mémoire seulement, hors de la vue et de la sauvegarde.
  let history: DraftHistory = EMPTY_DRAFT_HISTORY;
  let isTraceRecorded = false; // l'étape du tracé en cours est déjà dans l'historique
  const listeners = new Set<() => void>();
  // Écart §5.3 (JOURNAL 2026-10-24) : la version du dernier rapprochement que ce brouillon connaît, et combien de fois il a été effacé.
  let knownMovedAtVersion = 0;
  let wipeCount = 0;
  const wipedListeners = new Set<() => void>();
  // Écart §5.3 (JOURNAL 2026-10-28) : le repère que ce brouillon connaît. `successors` : un brouillon décalé prend la place de
  // celui d'avant (l'historique, le toast de Vider), pour que Rétablir retrouve le sien.
  let knownOrigin: CanvasOrigin = START_ORIGIN;
  const successors = new WeakMap<Draft, Draft>();

  // Annuler et Rétablir se relisent dans l'historique à chaque publication (CDC 2026, §8 Historique).
  const publish = (next: Partial<DraftView>): void => {
    view = { ...view, ...next, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
    for (const listener of listeners) listener();
  };

  const forgetHistory = (): void => {
    history = EMPTY_DRAFT_HISTORY;
    isTraceRecorded = false;
    if (view.canUndo || view.canRedo) publish({}); // le brouillon peut ne pas changer : les deux boutons se grisent quand même
  };

  // Une étape : le brouillon d'avant entre dans l'historique, et ce qui pouvait être rétabli s'efface.
  const recordStep = (): void => {
    history = recordDraftStep(history, view.draft);
  };

  const leaveDraftMode = (): void =>
    publish({ mode: "view", isTracing: false, isTouchTracing: false, isPicking: false });

  const notifyWiped = (): void => {
    for (const listener of wipedListeners) listener();
  };

  // Le brouillon d'un utilisateur ne se lit qu'après le `welcome` : c'est lui qui donne le `userId`.
  // Écart §5.3 (JOURNAL 2026-10-24) : sauvegardé avant un rapprochement, il est jeté, effacé du stockage, et dit.
  const applySavedDraft = (): void => {
    const { userId, status, width, height, palette, movedAtVersion, origin } = canvas.getView();
    if (!userId || status !== "live" || userId === loadedUserId) return;
    loadedUserId = userId;
    knownMovedAtVersion = movedAtVersion ?? 0;
    knownOrigin = origin;
    forgetHistory();
    const bounds = { width, height, paletteSize: palette.length, movedAtVersion, origin };
    const isStale = isSavedDraftStale(getStorage, canvasId, userId, movedAtVersion);
    publish({ draft: getSavedDraft(getStorage, canvasId, userId, bounds) });
    if (!isStale) return;
    saveDraft(getStorage, canvasId, userId, EMPTY_DRAFT, knownMovedAtVersion, knownOrigin);
    notifyWiped();
  };
  // §10.2 : un banni sort du Dessin, son brouillon reste sauvegardé. Écart §15 (JOURNAL 2026-10-06) : une archive aussi,
  // personne n'y pose ; le brouillon reste rangé sous ce canvas et ne suit pas sur le nouveau.
  const leaveIfReadOnly = (): void => {
    const { isBanned, isArchived } = canvas.getView();
    if ((isBanned || isArchived) && view.mode === "draft") leaveDraftMode();
  };
  const fitted = (draft: Draft): Draft => {
    const { width, height } = canvas.getView();
    return width > 0 ? fitDraft(draft, { width, height }) : draft;
  };
  // §5.3 : le canvas a rétréci, ce qui sort du cadre quitte le brouillon.
  const fitToCanvas = (): void => {
    if (loadedUserId) setDraft(fitted(view.draft));
  };
  const unsubscribe = canvas.subscribe(() => {
    applySavedDraft();
    leaveIfReadOnly();
    if (wipeIfMoved()) return;
    followOrigin();
    fitToCanvas();
  });
  applySavedDraft();

  const setDraft = (draft: Draft): void => {
    if (draft === view.draft) return;
    publish({ draft });
    if (loadedUserId) saveDraft(getStorage, canvasId, loadedUserId, draft, knownMovedAtVersion, knownOrigin);
  };

  // Écart §5.3 (JOURNAL 2026-10-24) : des pixels ont changé de case, ses x, y sont faux, et Annuler parle d'un autre dessin.
  // Sans étape dans l'historique, rien n'est proposé à Rétablir.
  const wipeIfMoved = (): boolean => {
    const moved = canvas.getView().movedAtVersion ?? 0;
    if (!loadedUserId || moved === knownMovedAtVersion) return false;
    knownMovedAtVersion = moved;
    knownOrigin = canvas.getView().origin;
    wipeCount += 1;
    const hadDraft = view.draft.size > 0;
    forgetHistory();
    setDraft(EMPTY_DRAFT);
    if (hadDraft) notifyWiped();
    return true;
  };

  // Écart §5.3 (JOURNAL 2026-10-28) : la fresque a grandi à gauche ou en haut, ou s'est resserrée : ses cases ont changé de numéro de
  // colonne ou de ligne, et celles du brouillon, de l'historique comme du toast de Vider suivent. Rien n'est effacé.
  const followOrigin = (): void => {
    const { origin } = canvas.getView();
    const shift = originShift(knownOrigin, origin);
    if (!loadedUserId || (shift.x === 0 && shift.y === 0)) return;
    knownOrigin = origin;
    const follow = (draft: Draft): Draft => {
      const moved = shiftDraft(draft, shift);
      successors.set(draft, moved);
      return moved;
    };
    history = { past: history.past.map(follow), future: history.future.map(follow) };
    setDraft(follow(view.draft));
  };

  // Le brouillon d'aujourd'hui qui descend de `draft`, décalé autant de fois que la fresque l'a été depuis.
  const currentOf = (draft: Draft): Draft => {
    let latest = draft;
    for (let next = successors.get(latest); next; next = successors.get(latest)) latest = next;
    return latest;
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

  const shakeGauge = (): void => publish({ shakeCount: view.shakeCount + 1 });

  const applyEdit = (edit: DraftEdit, canShake: boolean): void => {
    setDraft(edit.draft);
    if (edit.isCapped && canShake) shakeGauge();
  };

  // Un changement du brouillon d'un coup (Vider, Retour arrière) est une étape.
  const commitStep = (draft: Draft): void => {
    if (draft === view.draft) return;
    recordStep();
    setDraft(draft);
  };

  // Annuler et Rétablir (CDC 2026, §8) : pas pendant un tracé, jamais au-delà de la jauge, et dans le cadre d'aujourd'hui.
  const travel = (move: (from: DraftHistory, current: Draft) => DraftTravel | null): void => {
    if (!isEditable() || view.isTracing) return;
    const step = move(history, view.draft);
    if (!step) return;
    const draft = fitted(step.draft);
    if (draft.size > view.draft.size && draft.size > context().charges) {
      shakeGauge();
      return;
    }
    history = step.history;
    setDraft(draft);
  };

  // Écart §5.3 (JOURNAL 2026-10-28) : la fresque peut être décalée pendant l'attente. Un lot prévu dans le repère `plannedOrigin` se redit
  // dans celui d'aujourd'hui avant de partir, sans les cases que le brouillon a quittées.
  const batchNow = (planned: readonly Pixel[], plannedOrigin: CanvasOrigin): Pixel[] =>
    shiftBatch(planned, originShift(plannedOrigin, knownOrigin)).filter(({ x, y }) =>
      view.draft.has(toCellKey(x, y)),
    );

  // Envoie un lot et en règle l'ack, avec les cases redites dans le repère d'après l'attente de la réponse. Faux : on s'arrête, ce qui n'est
  // pas confirmé reste dans le brouillon (coupure ou refus du gateway, banni).
  const sendBatch = async (
    planned: readonly Pixel[],
    plannedOrigin: CanvasOrigin,
    placementId: string,
  ): Promise<boolean> => {
    const sentOrigin = knownOrigin;
    const batch = batchNow(planned, plannedOrigin);
    if (batch.length === 0) return true;
    const result = await canvas.placeBatch(batch, placementId);
    if (!result.ok) return false;
    setDraft(settleBatch(view.draft, shiftBatch(batch, originShift(sentOrigin, knownOrigin)), result.value));
    return !canvas.getView().isBanned;
  };

  // Un lot à la fois, après l'ack du précédent, jamais plus de 8 par seconde. Tous portent la pose de la validation.
  const sendBatches = async (): Promise<void> => {
    const placementId = randomPlacementId();
    const plannedOrigin = knownOrigin;
    let lastSentAt = Number.NEGATIVE_INFINITY;
    for (const planned of toBatches(view.draft)) {
      const delay = lastSentAt + SEND_INTERVAL_MS - clock.now();
      if (delay > 0) await clock.wait(delay);
      lastSentAt = clock.now();
      if (!(await sendBatch(planned, plannedOrigin, placementId))) return;
    }
  };

  const submit = async (): Promise<void> => {
    const { status, isBanned, isArchived } = canvas.getView();
    if (view.isSending || view.draft.size === 0 || status !== "live" || isBanned || isArchived) return;
    forgetHistory(); // CDC 2026, §8 : une vraie pose ne s'annule jamais
    const wipesBefore = wipeCount;
    publish({ isSending: true });
    try {
      await sendBatches();
    } finally {
      publish({ isSending: false });
    }
    // Tout est posé : retour en Vue (CDC 2026). Des refus restent, ils restent visibles en Dessin. Effacé en route par un
    // rapprochement (Écart §5.3, JOURNAL 2026-10-24), il est vide sans que rien n'ait été posé.
    if (view.draft.size === 0 && wipeCount === wipesBefore) {
      leaveDraftMode();
      onPlaced?.();
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    enterDraftMode() {
      const { userId, isBanned, isArchived } = canvas.getView();
      if (isBanned || isArchived) return;
      // Un invité n'entre jamais en Dessin : la pill Dessin lui montre déjà l'invitation (CDC 2026).
      if (userId && !view.isSending) publish({ mode: "draft", isTouchTracing: isTouchTracingRemembered });
    },
    exitDraftMode() {
      if (!view.isSending) leaveDraftMode();
    },
    discardDraft() {
      const cleared = view.draft;
      if (!isEditable() || cleared.size === 0) return undefined;
      commitStep(EMPTY_DRAFT);
      return cleared;
    },
    restoreDraft(cleared) {
      if (history.past.at(-1) === currentOf(cleared)) travel(undoDraftStep);
    },
    listenWiped(listener) {
      wipedListeners.add(listener);
      return () => wipedListeners.delete(listener);
    },
    selectColor,
    selectRecentColor(slot) {
      const colorIndex = view.recentColorIndexes[slot];
      if (colorIndex !== undefined && isEditable()) selectColor(colorIndex);
    },
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
      if (!isEditable()) return;
      const edit = toggleDraftCell(view.draft, { x, y, colorIndex: view.colorIndex }, context());
      if (edit.draft !== view.draft) recordStep();
      applyEdit(edit, true);
    },
    discardCell(x, y) {
      if (isEditable()) commitStep(discardDraftCell(view.draft, x, y));
    },
    startTrace() {
      if (!isEditable() || view.isTracing || view.isPicking) return;
      hasShakenThisTrace = false;
      isTraceRecorded = false;
      publish({ isTracing: true });
    },
    // Le plafond atteint pendant un tracé ne fait vibrer la jauge qu'une fois (CDC 2026).
    // Un tracé entier est une seule étape, ouverte à sa première case.
    traceCells(cells) {
      if (!isEditable() || !view.isTracing) return;
      const pixels = cells.map(({ x, y }) => ({ x, y, colorIndex: view.colorIndex }));
      const edit = traceDraftCells(view.draft, pixels, context());
      const canShake = !hasShakenThisTrace;
      if (edit.isCapped) hasShakenThisTrace = true; // avant la publication : un abonné qui retrace ne revibre pas
      if (!isTraceRecorded && edit.draft !== view.draft) {
        isTraceRecorded = true; // de même : un abonné qui retrace n'ouvre pas une seconde étape
        recordStep();
      }
      applyEdit(edit, canShake);
    },
    endTrace() {
      if (view.isTracing) publish({ isTracing: false });
    },
    toggleTouchTracing() {
      if (view.mode !== "draft") return;
      isTouchTracingRemembered = !view.isTouchTracing;
      publish({ isTouchTracing: isTouchTracingRemembered });
    },
    undo: () => travel(undoDraftStep),
    redo: () => travel(redoDraftStep),
    submit,
    dispose: unsubscribe,
  };
}

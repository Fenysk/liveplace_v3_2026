// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../state/canvas-store";
import { createDraftStore, type DraftStore } from "../state/draft-store";
import { AccountPill } from "../ui/account/account-pill";
import { accountPillOpeners } from "../ui/account/account-pill-openers";
import { type AccountSection, AccountWindow } from "../ui/account/account-window";
import { useAccountPillProps } from "../ui/account/use-account-pill";
import { useSigningIn } from "../ui/account/use-signing-in";
import { ArchivesTab } from "../ui/archive/archives-tab";
import { createOwnSwitchTracker } from "../ui/archive/own-switch";
import { useIsCanvasMissing } from "../ui/canvas/canvas-missing";
import { CanvasPill, type CanvasPillFold } from "../ui/canvas/canvas-pill";
import { CanvasRecovering, useIsCanvasRecovering } from "../ui/canvas/canvas-recovering";
import { createHandoff } from "../ui/canvas/canvas-scene";
import { CanvasTab } from "../ui/canvas/canvas-tab";
import { CANVAS_TEXTS } from "../ui/canvas/canvas-texts";
import { useOwnerProfile } from "../ui/canvas/owner-profile";
import { PixelCanvas } from "../ui/canvas/pixel-canvas";
import { useCanvasTheme } from "../ui/canvas/use-canvas-theme";
import { useCanvasToasts } from "../ui/canvas/use-canvas-toasts";
import { useFollowActiveCanvas } from "../ui/canvas/use-follow-active-canvas";
import type { ProfileUser } from "../ui/design/profile";
import { ThemePill } from "../ui/design/theme-pill";
import { ToastProvider } from "../ui/design/toast";
import { COMPACT_SCREEN_QUERY, SIDE_COLUMN_QUERY, useMediaQuery } from "../ui/design/use-media-query";
import { DeveloperWindow } from "../ui/developer/developer-window";
import { LiveActivitySection } from "../ui/developer/live-activity-section";
import { LiveCapacitySection } from "../ui/developer/live-capacity-section";
import { useDeveloperWindow } from "../ui/developer/use-developer-window";
import { browserClock, getBrowserStorage } from "../ui/draft/browser-draft";
import { DraftPill, type DraftPillActions } from "../ui/draft/draft-pill";
import { useDraftPillProps } from "../ui/draft/use-draft-pill";
import { useDraftingAttribute } from "../ui/draft/use-drafting-attribute";
import { BubbleTargetsContext, useBubbleTargets } from "../ui/help/bubble-target";
import { HelpBubbles } from "../ui/help/help-bubbles";
import { recordDraftPan, useHelpBubbles } from "../ui/help/use-help-bubbles";
import { FirstHint } from "../ui/hint/first-hint";
import { recordFirstHintStep, useFirstHintProps } from "../ui/hint/use-first-hint";
import { InspectionPill } from "../ui/inspection/inspection-pill";
import { useInspectionPillProps } from "../ui/inspection/use-inspection-pill";
import { type LinkPreviewPage, linkPreviewMeta } from "../ui/link-preview/link-preview";
import { type Locale, localeOfMatches } from "../ui/locale/locale";
import { FixedLocale, useTexts } from "../ui/locale/use-locale";
import { BannedWindow } from "../ui/moderation/banned-window";
import { ModerationTab } from "../ui/moderation/moderation-tab";
import { ModerationWindow } from "../ui/moderation/moderation-window";
import { useBannedWindowProps } from "../ui/moderation/use-banned-window";
import { useModeration } from "../ui/moderation/use-moderation";
import { useReport } from "../ui/moderation/use-report";
import { ObsPage } from "../ui/obs/obs-page";
import { ObsTab } from "../ui/obs/obs-tab";
import { isObsView, useIsObsView } from "../ui/obs/obs-view";
import { pwaHead } from "../ui/pwa/pwa-head";
import { useBarColor } from "../ui/pwa/use-bar-color";
import { ScoreboardList } from "../ui/scoreboard/scoreboard-list";
import { ScoreboardPill } from "../ui/scoreboard/scoreboard-pill";
import { useScoreboardRows } from "../ui/scoreboard/use-scoreboard";
import { useScoreboardCollapse } from "../ui/scoreboard/use-scoreboard-collapse";
import { CanvasNotFound, noStoreHeaders, resolveGameCanvasPage } from "./-canvas-page";

// `canvasId` : à quel canvas ces stores sont ouverts. La page en change quand le streamer archive (Écart §15, JOURNAL 2026-10-06).
type Stores = { canvasId: string; canvas: CanvasStore; draft: DraftStore };

// Avant les stores (rendu serveur, puis le temps d'ouvrir le WebSocket), la pill Dessin est déjà là, en connexion.
const doNothing = (): void => undefined;
const CONNECTING_ACTIONS: DraftPillActions = {
  onEnter: doNothing,
  onClaim: doNothing,
  onExit: doNothing,
  onSubmit: doNothing,
  onDiscard: doNothing,
  onPickColor: doNothing,
  onToggleEraser: doNothing,
  onTogglePicker: doNothing,
  onToggleTouchTracing: doNothing,
  onReload: doNothing,
  onSignIn: doNothing,
};

type LivePillsProps = {
  stores: Stores;
  login: string;
  owner: ProfileUser;
  isCompact: boolean;
  isOwnerSession: boolean; // le serveur a lu le cookie : vrai tant que le gateway n'a pas dit le rôle (JOURNAL 2026-10-06)
  canvasPillFold: CanvasPillFold;
};

// Un seul menu flottant (CDC 2026) : la pill Compte l'ouvre sur Mon compte, ou sur Canvas par Réglages.
type WindowState = { isOpen: boolean; sectionId: AccountSection };

// La section que la fenêtre montre, absente si elle est fermée : ouverte, elle a ses propres bulles d'aide (JOURNAL 2026-10-09).
const shownSection = ({ isOpen, sectionId }: WindowState): AccountSection | undefined =>
  isOpen ? sectionId : undefined;

// Les pills qui lisent les stores : chacune reçoit ses props de son hook (JOURNAL 2026-09-24).
const LivePills = ({ stores, login, owner, isCompact, isOwnerSession, canvasPillFold }: LivePillsProps) => {
  const { signOutHref, ...account } = useAccountPillProps(stores.canvas, login);
  const signingIn = useSigningIn();
  // Écart §15 (JOURNAL 2026-10-06) : cette page sait quand elle a demandé le changement de canvas, pour ne pas le dire à ses viewers.
  const [switchTracker] = useState(createOwnSwitchTracker);
  const draft = useDraftPillProps(stores, login, signingIn);
  const bubbleTargets = useBubbleTargets();
  const [windowState, setWindowState] = useState<WindowState>({ isOpen: false, sectionId: "account" });
  const help = useHelpBubbles(stores, draft.state, shownSection(windowState)); // Écart §8.1 (JOURNAL 2026-10-08) : les bulles d'aide, une à la fois
  useDraftingAttribute(stores.draft); // Écart §8.1 (JOURNAL 2026-10-08) : en Dessin sur mobile, seule la bande Thème reste en haut
  const moderation = useModeration(stores.canvas);
  const reporting = useReport(stores.canvas);
  useCanvasToasts(stores, switchTracker, owner.displayName);
  const inspection = useInspectionPillProps(stores, moderation.controls, reporting.control);
  const firstHint = useFirstHintProps(stores, help.isBusy); // Écart §8.1 (JOURNAL 2026-10-08) : le conseil de première visite
  const banned = useBannedWindowProps(stores.canvas);
  const developer = useDeveloperWindow(stores.canvas); // écart §10.3 (JOURNAL 2026-10-06) : le développeur seul
  const scoreboard = useScoreboardRows(stores.canvas);
  const scoreboardCollapse = useScoreboardCollapse();
  const ownerProfile = useOwnerProfile(stores.canvas, owner); // Écart §4 (JOURNAL 2026-10-07) : son live
  const isSidePanel = useMediaQuery(SIDE_COLUMN_QUERY); // Écart §8.1 (JOURNAL 2026-10-08) : paysage sur un écran bas
  const getRole = () => stores.canvas.getView().role;
  const role = useSyncExternalStore(stores.canvas.subscribe, getRole, getRole);
  const isOwner = role === "owner";
  // Avant le `hello`, le streamer n'attend que sa pill : ni celle de gauche, ni celle de droite ; ensuite, le gateway décide.
  const isWaitingForOwner = role === undefined && isOwnerSession;
  const openWindow = (sectionId: AccountSection) => {
    setWindowState({ isOpen: true, sectionId });
    help.onWindowSection(sectionId);
  };
  return (
    <BubbleTargetsContext value={bubbleTargets}>
      {/* Sur son canvas, le streamer n'a qu'une pill : la pill Compte porte ses Réglages. */}
      {!isOwner && !isWaitingForOwner && (
        <CanvasPill owner={ownerProfile} isCompact={isCompact} fold={canvasPillFold} />
      )}
      <AccountPill
        {...account}
        isCompact={isCompact}
        isVisible={!isWaitingForOwner}
        {...accountPillOpeners(role, account.pendingReports, openWindow)}
        onOpenDeveloper={developer.onOpen}
        onSignIn={signingIn.onSignIn}
      />
      {developer.onOpen && (
        // Écart §14 (JOURNAL 2026-10-07) : la fenêtre Développeur reste en français, quelle que soit la langue de la page.
        <FixedLocale locale="fr">
          <DeveloperWindow
            isOpen={developer.isOpen}
            sectionId={developer.sectionId}
            onSelect={developer.onSelect}
            onClose={developer.onClose}
          >
            {developer.sectionId === "capacity" ? (
              <LiveCapacitySection canvas={stores.canvas} isOpen={developer.isOpen} />
            ) : (
              <LiveActivitySection
                canvas={stores.canvas}
                isOpen={developer.isOpen}
                sectionId={developer.sectionId}
              />
            )}
          </DeveloperWindow>
        </FixedLocale>
      )}
      {account.identity.kind === "signedIn" && (
        <AccountWindow
          {...windowState}
          onSelect={openWindow}
          onClose={() => setWindowState((shown) => ({ ...shown, isOpen: false }))}
          user={account.identity.user}
          signOutHref={signOutHref}
          appearanceChoice={account.appearanceChoice}
          onPickAppearance={account.onPickAppearance}
          moderationTab={
            moderation.controls && (
              <ModerationTab
                canvas={stores.canvas}
                login={login}
                onSync={signingIn.onSignIn}
                onModerate={moderation.controls.onModerate}
              />
            )
          }
          obsTab={
            isOwner ? (
              <ObsTab canvas={stores.canvas} login={login} onCopy={help.onObsAddressCopied} />
            ) : undefined
          }
          canvasTab={
            isOwner ? (
              <CanvasTab canvas={stores.canvas} canvasId={stores.canvasId} login={login} />
            ) : undefined
          }
          canvasesTab={
            isOwner ? (
              <ArchivesTab
                key={stores.canvasId}
                canvas={stores.canvas}
                login={login}
                tracker={switchTracker}
              />
            ) : undefined
          }
          scoreboardTab={isCompact ? <ScoreboardList rows={scoreboard} /> : undefined}
        />
      )}
      <InspectionPill {...inspection} />
      {/* Sur mobile, le classement est une section de la fenêtre, pas une colonne. */}
      {!isCompact && (
        <ScoreboardPill
          rows={scoreboard}
          isCollapsed={scoreboardCollapse.isCollapsed}
          onToggle={scoreboardCollapse.toggle}
        />
      )}
      <DraftPill {...draft} isCompact={isCompact} isSidePanel={isSidePanel} />
      {firstHint && <FirstHint {...firstHint} />}
      <HelpBubbles shown={help.shown} isTouchScreen={help.isTouchScreen} refill={help.refill} />
      <ModerationWindow {...moderation.window} />
      <ModerationWindow {...reporting.window} />
      <BannedWindow {...banned} />
    </BubbleTargetsContext>
  );
};

// Écart §8.1 (JOURNAL 2026-10-07) : le thème du canvas, pour tous, dès le rendu serveur ; le gateway le suit ensuite en direct.
const CanvasThemePill = ({
  canvas,
  loaded,
}: {
  canvas: CanvasStore | undefined;
  loaded: string | undefined;
}) => <ThemePill theme={useCanvasTheme(canvas, loaded)} />;

const GamePage = () => {
  const { canvasId, owner, theme, isOwnerSession = false } = Route.useLoaderData();
  const { login } = Route.useParams();
  const { openCanvas } = Route.useRouteContext();
  const t = useTexts(CANVAS_TEXTS);
  const [stores, setStores] = useState<Stores>();
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const isCanvasMissing = useIsCanvasMissing(stores?.canvas);
  const isCanvasRecovering = useIsCanvasRecovering(stores?.canvas);
  // Écart §8.1 (JOURNAL 2026-10-08, 2026-10-09) : la pill Canvas se replie quand on déplace, zoome, recentre ou ouvre une case ; rien n'est retenu.
  const [isCanvasPillFolded, setIsCanvasPillFolded] = useState(false);
  const foldCanvasPill = useCallback(() => setIsCanvasPillFolded(true), []);
  // Écart §15 : la page qui suit le canvas actif garde l'ancienne fresque à l'écran jusqu'à l'arrivée de la nouvelle.
  const handoff = useRef(createHandoff());
  const unfoldCanvasPill = useCallback(() => setIsCanvasPillFolded(false), []);
  // Écart §15 (JOURNAL 2026-10-06) : le streamer archive, le loader rend le nouveau canvas actif, la page s'y rebranche.
  useFollowActiveCanvas(stores?.canvas);
  useBarColor(); // Écart §9.1 (JOURNAL 2026-10-08) : les barres du navigateur ou du système prennent le fond du jeu

  // Le WebSocket et le stockage n'existent que dans le navigateur : tout s'ouvre après le rendu serveur.
  useEffect(() => {
    // Dans OBS, la page bascule juste après l'hydratation : le jeu n'ouvre rien.
    if (isObsView()) return;
    const canvas = openCanvas(canvasId, "ui");
    const draft = createDraftStore(canvasId, canvas, getBrowserStorage, browserClock);
    setStores({ canvasId, canvas, draft });
    return () => {
      draft.dispose();
      canvas.close();
    };
  }, [canvasId, openCanvas]);

  // Redis remet ce canvas en place (Écart §4.2, JOURNAL 2026-10-08) : le message d'attente, pour tous. Puis, comme le canvas
  // introuvable, la page se rétablit seule : les stores restent ouverts.
  if (isCanvasRecovering) return <CanvasRecovering />;
  // Le gateway ne connaît pas ce canvas : la page du canvas introuvable.
  if (isCanvasMissing) return <CanvasNotFound />;

  // Empilés en Z (CDC 2026) : le vide, qui est le fond de la page, puis le canvas, puis les pills.
  // `lp-game` : caché dès la première image en vue OBS (JOURNAL 2026-09-25).
  return (
    <main className="lp-game">
      <h1 className="lp-visually-hidden">{t.pageTitle(owner.displayName)}</h1>
      {stores?.canvasId === canvasId && (
        <PixelCanvas
          store={stores.canvas}
          draftStore={stores.draft}
          canvasId={canvasId}
          login={login}
          ownerName={owner.displayName}
          isFramedInFreeArea
          onGesture={foldCanvasPill}
          handoff={handoff.current}
          onNavigate={(kind) => {
            recordFirstHintStep(kind);
            recordDraftPan(kind, stores.draft);
          }}
        />
      )}
      {/* Le store d'un canvas qu'on quitte (le streamer vient d'archiver) ne dit plus le thème de celui-ci. */}
      <CanvasThemePill canvas={stores?.canvasId === canvasId ? stores.canvas : undefined} loaded={theme} />
      {stores ? (
        // CDC 2026, Toasts : un seul à la fois, pour toute la page.
        <ToastProvider>
          <LivePills
            stores={stores}
            login={login}
            owner={owner}
            isCompact={isCompact}
            isOwnerSession={isOwnerSession}
            canvasPillFold={{ isFolded: isCanvasPillFolded, onUnfold: unfoldCanvasPill }}
          />
        </ToastProvider>
      ) : (
        <>
          {!isOwnerSession && <CanvasPill owner={owner} isCompact={isCompact} />}
          <DraftPill state={{ kind: "connecting" }} actions={CONNECTING_ACTIONS} />
        </>
      )}
    </main>
  );
};

// La même adresse dans le navigateur et dans OBS (§9.1) : la marque posée avant la première peinture décide.
const CanvasPage = () => {
  const { canvasId } = Route.useLoaderData();
  const { login } = Route.useParams();
  const { openCanvas } = Route.useRouteContext();
  return useIsObsView() ? (
    <ObsPage canvasId={canvasId} login={login} openCanvas={openCanvas} />
  ) : (
    <GamePage />
  );
};

// L'application web de ce canvas (Écart §9.1, JOURNAL 2026-10-08, sans la vue OBS forcée `$login_.obs`), puis la carte d'aperçu du lien.
const canvasHead = (page: LinkPreviewPage, locale: Locale) => {
  const pwa = pwaHead(page.owner);
  return { ...pwa, meta: [...pwa.meta, ...linkPreviewMeta(page, locale)] };
};

export const Route = createFileRoute("/$login")({
  loader: resolveGameCanvasPage,
  head: ({ loaderData, matches }) => (loaderData ? canvasHead(loaderData, localeOfMatches(matches)) : {}),
  headers: noStoreHeaders,
  component: CanvasPage,
  notFoundComponent: CanvasNotFound,
});

// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
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
import { CanvasPill } from "../ui/canvas/canvas-pill";
import { CanvasRecovering, useIsCanvasRecovering } from "../ui/canvas/canvas-recovering";
import { CanvasTab } from "../ui/canvas/canvas-tab";
import { useOwnerProfile } from "../ui/canvas/owner-profile";
import { PixelCanvas } from "../ui/canvas/pixel-canvas";
import { useCanvasTheme } from "../ui/canvas/use-canvas-theme";
import { useCanvasToasts } from "../ui/canvas/use-canvas-toasts";
import { useFollowActiveCanvas } from "../ui/canvas/use-follow-active-canvas";
import type { ProfileUser } from "../ui/design/profile";
import { ThemePill } from "../ui/design/theme-pill";
import { ToastProvider } from "../ui/design/toast";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../ui/design/use-media-query";
import { DeveloperWindow } from "../ui/developer/developer-window";
import { LiveActivitySection } from "../ui/developer/live-activity-section";
import { LiveCapacitySection } from "../ui/developer/live-capacity-section";
import { useDeveloperWindow } from "../ui/developer/use-developer-window";
import { browserClock, getBrowserStorage } from "../ui/draft/browser-draft";
import { DraftPill, type DraftPillActions } from "../ui/draft/draft-pill";
import { useDraftPillProps } from "../ui/draft/use-draft-pill";
import { useDraftingAttribute } from "../ui/draft/use-drafting-attribute";
import { InspectionPill } from "../ui/inspection/inspection-pill";
import { useInspectionPillProps } from "../ui/inspection/use-inspection-pill";
import { BannedWindow } from "../ui/moderation/banned-window";
import { ModerationTab } from "../ui/moderation/moderation-tab";
import { ModerationWindow } from "../ui/moderation/moderation-window";
import { useBannedWindowProps } from "../ui/moderation/use-banned-window";
import { useModeration } from "../ui/moderation/use-moderation";
import { useReport } from "../ui/moderation/use-report";
import { ObsPage } from "../ui/obs/obs-page";
import { ObsTab } from "../ui/obs/obs-tab";
import { isObsView, useIsObsView } from "../ui/obs/obs-view";
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
};

// Un seul menu flottant (CDC 2026) : la pill Compte l'ouvre sur Mon compte, ou sur Canvas par Réglages.
type WindowState = { isOpen: boolean; sectionId: AccountSection };

// Les pills qui lisent les stores : chacune reçoit ses props de son hook (JOURNAL 2026-09-24).
const LivePills = ({ stores, login, owner, isCompact, isOwnerSession }: LivePillsProps) => {
  const { signOutHref, ...account } = useAccountPillProps(stores.canvas, login);
  const signingIn = useSigningIn();
  // Écart §15 (JOURNAL 2026-10-06) : cette page sait quand elle a demandé le changement de canvas, pour ne pas le dire à ses viewers.
  const [switchTracker] = useState(createOwnSwitchTracker);
  const draft = useDraftPillProps(stores, login, signingIn);
  useDraftingAttribute(stores.draft); // Écart §8.1 (JOURNAL 2026-10-08) : en Dessin sur mobile, seule la bande Thème reste en haut
  const moderation = useModeration(stores.canvas);
  const reporting = useReport(stores.canvas);
  useCanvasToasts(stores, switchTracker, owner.displayName);
  const inspection = useInspectionPillProps(stores, moderation.controls, reporting.control);
  const banned = useBannedWindowProps(stores.canvas);
  const developer = useDeveloperWindow(stores.canvas); // écart §10.3 (JOURNAL 2026-10-06) : le développeur seul
  const scoreboard = useScoreboardRows(stores.canvas);
  const scoreboardCollapse = useScoreboardCollapse();
  const ownerProfile = useOwnerProfile(stores.canvas, owner); // Écart §4 (JOURNAL 2026-10-07) : son live
  const getRole = () => stores.canvas.getView().role;
  const role = useSyncExternalStore(stores.canvas.subscribe, getRole, getRole);
  const isOwner = role === "owner";
  // Avant le `hello`, le streamer n'attend que sa pill : ni celle de gauche, ni celle de droite ; ensuite, le gateway décide.
  const isWaitingForOwner = role === undefined && isOwnerSession;
  const [windowState, setWindowState] = useState<WindowState>({ isOpen: false, sectionId: "account" });
  const openWindow = (sectionId: AccountSection) => setWindowState({ isOpen: true, sectionId });
  return (
    <>
      {/* Sur son canvas, le streamer n'a qu'une pill : la pill Compte porte ses Réglages. */}
      {!isOwner && !isWaitingForOwner && <CanvasPill owner={ownerProfile} isCompact={isCompact} />}
      <AccountPill
        {...account}
        isCompact={isCompact}
        isVisible={!isWaitingForOwner}
        {...accountPillOpeners(role, account.pendingReports, openWindow)}
        onOpenDeveloper={developer.onOpen}
        onSignIn={signingIn.onSignIn}
      />
      {developer.onOpen && (
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
      )}
      {account.identity.kind === "signedIn" && (
        <AccountWindow
          {...windowState}
          onSelect={(sectionId) => setWindowState({ isOpen: true, sectionId })}
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
          obsTab={isOwner ? <ObsTab canvas={stores.canvas} login={login} /> : undefined}
          canvasTab={isOwner ? <CanvasTab canvas={stores.canvas} /> : undefined}
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
      <DraftPill {...draft} isCompact={isCompact} />
      <ModerationWindow {...moderation.window} />
      <ModerationWindow {...reporting.window} />
      <BannedWindow {...banned} />
    </>
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
  const [stores, setStores] = useState<Stores>();
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const isCanvasMissing = useIsCanvasMissing(stores?.canvas);
  const isCanvasRecovering = useIsCanvasRecovering(stores?.canvas);
  // Écart §15 (JOURNAL 2026-10-06) : le streamer archive, le loader rend le nouveau canvas actif, la page s'y rebranche.
  useFollowActiveCanvas(stores?.canvas);

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
      <h1 className="lp-visually-hidden">Canvas de {owner.displayName}</h1>
      {stores?.canvasId === canvasId && (
        <PixelCanvas
          store={stores.canvas}
          draftStore={stores.draft}
          canvasId={canvasId}
          ownerName={owner.displayName}
          isFramedInFreeArea
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
  const { openCanvas } = Route.useRouteContext();
  return useIsObsView() ? <ObsPage canvasId={canvasId} openCanvas={openCanvas} /> : <GamePage />;
};

export const Route = createFileRoute("/$login")({
  loader: resolveGameCanvasPage,
  headers: noStoreHeaders,
  component: CanvasPage,
  notFoundComponent: CanvasNotFound,
});

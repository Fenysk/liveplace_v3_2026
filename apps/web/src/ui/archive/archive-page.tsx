// La page d'une archive, `/{login}/archives/{code}` (§17.1) : le canvas figé, qu'on
// regarde sans pouvoir y poser. Zoom, déplacement, inspection d'un pixel (son auteur, sa date), le lien à copier et le
// dessin en PNG. Ni palette, ni brouillon, ni modération. Tous ceux qui ont le lien la voient, connectés ou non.

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CanvasOpener, CanvasStore } from "../../state/canvas-store";
import { createDraftStore, type DraftStore } from "../../state/draft-store";
import type { ResolvedArchive } from "../../usecase/resolve-archive";
import { AccountPill } from "../account/account-pill";
import { AccountWindow } from "../account/account-window";
import { DeleteAccountWindow } from "../account/delete-account-window";
import { type AccountDeletion, useAccountDeletion } from "../account/use-account-deletion";
import { useAccountPillProps } from "../account/use-account-pill";
import { useSigningIn } from "../account/use-signing-in";
import { useIsCanvasMissing } from "../canvas/canvas-missing";
import { CanvasRecovering, useIsCanvasRecovering } from "../canvas/canvas-recovering";
import { useIsCanvasDiscarded, useIsCanvasReopened } from "../canvas/canvas-status";
import { useOwnerProfile } from "../canvas/owner-profile";
import { PixelCanvas } from "../canvas/pixel-canvas";
import { ToastProvider, useToast } from "../design/toast";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { browserClock, getBrowserStorage } from "../draft/browser-draft";
import { restartDeviceTutorial } from "../help/tutorial";
import { InspectionPill } from "../inspection/inspection-pill";
import { useInspectionPillProps } from "../inspection/use-inspection-pill";
import { useLocale, useTexts } from "../locale/use-locale";
import { ArchiveBanner } from "./archive-banner";
import { ArchiveNotFound } from "./archive-not-found";
import { ARCHIVE_TEXTS, bannerCaption, bannerTitle } from "./archive-texts";
import { DownloadWindow } from "./download-window";
import { downloadPng, type PngBackground, pngFileName, pngScale, toPngPixels } from "./png-export";
import { useCopyLink } from "./use-copy-link";

type Stores = { canvas: CanvasStore; draft: DraftStore };

// Le compte, l'inspection : ce que la page lit des stores. Ni Dessin, ni modération, ni signalement.
const ArchiveAccount = ({
  stores,
  login,
  isCompact,
  deletion,
}: {
  stores: Stores;
  login: string;
  isCompact: boolean;
  deletion: AccountDeletion;
}) => {
  const { signOutHref, ...account } = useAccountPillProps(stores.canvas, login);
  const signingIn = useSigningIn();
  const inspection = useInspectionPillProps(stores, undefined, undefined);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <AccountPill
        {...account}
        isCompact={isCompact}
        hasBottomBar={false}
        onOpenAccount={() => setIsOpen(true)}
        onSignIn={signingIn.onSignIn}
      />
      {account.identity.kind === "signedIn" && (
        <AccountWindow
          isOpen={isOpen}
          sectionId="account"
          onSelect={() => undefined}
          onClose={() => setIsOpen(false)}
          user={account.identity.user}
          signOutHref={signOutHref}
          appearanceChoice={account.appearanceChoice}
          onPickAppearance={account.onPickAppearance}
          onRestartTutorial={restartDeviceTutorial}
          onDeleteAccount={deletion.onOpen}
        />
      )}
      <DeleteAccountWindow {...deletion.window} />
      <InspectionPill {...inspection} />
    </>
  );
};

type ArchiveControlsProps = {
  archive: ResolvedArchive;
  stores: Stores | undefined;
  isCompact: boolean;
  deletion: AccountDeletion; // CDC §8 : portée par la page, que l'archive qui part sous elle ne fait pas disparaître
};

const ArchiveControls = ({ archive, stores, isCompact, deletion }: ArchiveControlsProps) => {
  const toast = useToast();
  const locale = useLocale();
  const t = useTexts(ARCHIVE_TEXTS);
  const copyLink = useCopyLink();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [background, setBackground] = useState<PngBackground | null>(null);
  const { owner, createdAt, archivedAt, theme } = archive;
  const ownerProfile = useOwnerProfile(stores?.canvas, owner); // §10.4 : son live

  // Le dessin visible, case par case : le même que celui de la page, agrandi sans lissage, sur le fond choisi.
  const download = async (choice: PngBackground): Promise<void> => {
    if (!stores) return;
    const { width, height, pixels, palette } = stores.canvas.getView();
    if (width === 0) return;
    setIsDownloading(true);
    try {
      const scale = pngScale(width, height);
      const rgba = toPngPixels(pixels, width, height, palette, scale, choice);
      await downloadPng(rgba, width * scale, height * scale, pngFileName(owner.login, archivedAt));
    } catch (error) {
      console.error("archive : l'image n'a pas été produite", error);
      toast("error", t.downloadFailed);
    } finally {
      setIsDownloading(false);
    }
  };

  // Aucun fond n'est présélectionné : chaque ouverture repart sans choix.
  const openChoice = () => {
    setBackground(null);
    setIsChoosing(true);
  };

  const confirm = () => {
    if (background === null) return;
    setIsChoosing(false);
    void download(background);
  };

  return (
    <>
      <ArchiveBanner
        owner={ownerProfile}
        title={bannerTitle({ displayName: owner.displayName, theme }, locale)}
        caption={bannerCaption({ displayName: owner.displayName, theme, createdAt, archivedAt }, locale)}
        isDownloading={isDownloading || !stores}
        onCopyLink={() => copyLink(window.location.pathname)}
        onDownload={openChoice}
        isCompact={isCompact}
      />
      <DownloadWindow
        isOpen={isChoosing}
        background={background}
        onBackground={setBackground}
        isCompact={isCompact}
        onConfirm={confirm}
        onClose={() => setIsChoosing(false)}
      />
      {stores && (
        <ArchiveAccount stores={stores} login={owner.login} isCompact={isCompact} deletion={deletion} />
      )}
    </>
  );
};

type ArchivePageProps = { archive: ResolvedArchive; openCanvas: CanvasOpener };

export const ArchivePage = ({ archive, openCanvas }: ArchivePageProps) => {
  const { canvasId, owner } = archive;
  const t = useTexts(ARCHIVE_TEXTS);
  const [stores, setStores] = useState<Stores>();
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const navigate = useNavigate();
  const deletion = useAccountDeletion();
  // CDC §8 : l'archive d'un compte qui se supprime part sous ses pieds ; la page reste telle quelle jusqu'à l'accueil.
  const isMissing = useIsCanvasMissing(stores?.canvas) && !deletion.isRunning;
  const isRecovering = useIsCanvasRecovering(stores?.canvas) && !deletion.isRunning;
  const isDiscarded = useIsCanvasDiscarded(stores?.canvas) && !deletion.isRunning;
  const isReopened = useIsCanvasReopened(stores?.canvas);

  // Le WebSocket et le stockage n'existent que dans le navigateur : tout s'ouvre après le rendu serveur.
  useEffect(() => {
    const canvas = openCanvas(canvasId, "ui");
    const draft = createDraftStore(canvasId, canvas, getBrowserStorage, browserClock);
    setStores({ canvas, draft });
    return () => {
      draft.dispose();
      canvas.close();
    };
  }, [canvasId, openCanvas]);

  // Le streamer l'a rouverte : ce canvas est de nouveau le canvas actif, qui vit à `/{login}`.
  useEffect(() => {
    if (isReopened) void navigate({ to: "/$login", params: { login: owner.login } });
  }, [isReopened, navigate, owner.login]);

  // Redis remet cette archive en place (§7.4) : le même message, la page reprend seule.
  if (isRecovering) return <CanvasRecovering />;
  if (isMissing || isDiscarded)
    return <ArchiveNotFound login={owner.login} displayName={owner.displayName} />;

  // Empilés en Z comme la page du jeu : le vide, le canvas, puis les pills.
  return (
    <main className="lp-game">
      <h1 className="lp-visually-hidden">{t.pageTitle(owner.displayName)}</h1>
      {stores && (
        <PixelCanvas
          store={stores.canvas}
          draftStore={stores.draft}
          canvasId={canvasId}
          login={owner.login}
          ownerName={owner.displayName}
        />
      )}
      <ToastProvider>
        <ArchiveControls archive={archive} stores={stores} isCompact={isCompact} deletion={deletion} />
      </ToastProvider>
    </main>
  );
};

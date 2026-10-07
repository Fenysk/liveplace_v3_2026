// La page d'une archive, `/{login}/archives/{code}` (Écart §15, JOURNAL 2026-10-06) : le canvas figé, qu'on
// regarde sans pouvoir y poser. Zoom, déplacement, inspection d'un pixel (son auteur, sa date), le lien à copier et le
// dessin en PNG. Ni palette, ni brouillon, ni modération. Tous ceux qui ont le lien la voient, connectés ou non.

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CanvasOpener, CanvasStore } from "../../state/canvas-store";
import { createDraftStore, type DraftStore } from "../../state/draft-store";
import type { ResolvedArchive } from "../../usecase/resolve-archive";
import { AccountPill } from "../account/account-pill";
import { AccountWindow } from "../account/account-window";
import { useAccountPillProps } from "../account/use-account-pill";
import { useSigningIn } from "../account/use-signing-in";
import { useIsCanvasMissing } from "../canvas/canvas-missing";
import { useIsCanvasDiscarded, useIsCanvasReopened } from "../canvas/canvas-status";
import { PixelCanvas } from "../canvas/pixel-canvas";
import { ToastProvider, useToast } from "../design/toast";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { browserClock, getBrowserStorage } from "../draft/browser-draft";
import { InspectionPill } from "../inspection/inspection-pill";
import { useInspectionPillProps } from "../inspection/use-inspection-pill";
import { ArchiveBanner } from "./archive-banner";
import { ArchiveNotFound } from "./archive-not-found";
import { bannerCaption, bannerTitle } from "./archive-texts";
import { DownloadWindow } from "./download-window";
import { downloadPng, type PngBackground, pngFileName, pngScale, toPngPixels } from "./png-export";
import { useCopyLink } from "./use-copy-link";

type Stores = { canvas: CanvasStore; draft: DraftStore };

// Le compte, l'inspection : ce que la page lit des stores. Ni Dessin, ni modération, ni signalement.
const ArchiveAccount = ({
  stores,
  login,
  isCompact,
}: {
  stores: Stores;
  login: string;
  isCompact: boolean;
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
          themeChoice={account.themeChoice}
          onPickTheme={account.onPickTheme}
        />
      )}
      <InspectionPill {...inspection} />
    </>
  );
};

type ArchiveControlsProps = { archive: ResolvedArchive; stores: Stores | undefined; isCompact: boolean };

const ArchiveControls = ({ archive, stores, isCompact }: ArchiveControlsProps) => {
  const toast = useToast();
  const copyLink = useCopyLink();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [background, setBackground] = useState<PngBackground | null>(null);
  const { owner, createdAt, archivedAt, name } = archive;

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
      toast("error", "Téléchargement impossible : le navigateur n'a pas produit l'image.");
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
        owner={owner}
        title={bannerTitle({ displayName: owner.displayName, name })}
        caption={bannerCaption({ displayName: owner.displayName, name, createdAt, archivedAt })}
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
      {stores && <ArchiveAccount stores={stores} login={owner.login} isCompact={isCompact} />}
    </>
  );
};

type ArchivePageProps = { archive: ResolvedArchive; openCanvas: CanvasOpener };

export const ArchivePage = ({ archive, openCanvas }: ArchivePageProps) => {
  const { canvasId, owner } = archive;
  const [stores, setStores] = useState<Stores>();
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const navigate = useNavigate();
  const isMissing = useIsCanvasMissing(stores?.canvas);
  const isDiscarded = useIsCanvasDiscarded(stores?.canvas);
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

  if (isMissing || isDiscarded)
    return <ArchiveNotFound login={owner.login} displayName={owner.displayName} />;

  // Empilés en Z comme la page du jeu : le vide, le canvas, puis les pills.
  return (
    <main className="lp-game">
      <h1 className="lp-visually-hidden">Archive du canvas de {owner.displayName}</h1>
      {stores && (
        <PixelCanvas
          store={stores.canvas}
          draftStore={stores.draft}
          canvasId={canvasId}
          ownerName={owner.displayName}
        />
      )}
      <ToastProvider>
        <ArchiveControls archive={archive} stores={stores} isCompact={isCompact} />
      </ToastProvider>
    </main>
  );
};

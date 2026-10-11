// L'onglet Modération de la fenêtre (CDC 2026, JOURNAL 2026-09-25) : les bannis, les pixels de chaque bannissement
// à l'œil, dans une fenêtre superposée (JOURNAL 2026-09-27), et Débannir. L'affichage seul, nourri par
// `useModerationTabProps`.

import type { BannedUser, Pixel } from "@liveplace/domain/ports";
import { Eye } from "lucide-react";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { PixelPreview } from "../design/pixel-preview";
import { SmallWindow, useShownWhileClosing, WindowRow } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { ConnectionLost } from "./connection-lost";
import { MarkedProfile } from "./marked-profile";
import { MODERATION_TEXTS } from "./moderation-texts";
import type { CanvasPreviewProps } from "./moderation-window";

export type BannedList =
  | { status: "loading" }
  | { status: "ready"; users: readonly BannedUser[] }
  | { status: "failed" };

// Un seul aperçu ouvert à la fois ; `pixels` à `null` tant qu'il se charge.
export type BanPreview = { userId: string; pixels: readonly Pixel[] | null };

export type BannedUsersProps = {
  list: BannedList;
  preview: BanPreview | null;
  unbanningUserId: string | null; // Débannir attend sa réponse
  canvas: CanvasPreviewProps;
  onPreview: (userId: string) => void; // l'œil : ouvre son aperçu, ou le referme
  onUnban: (userId: string) => void;
};

type BannedRowProps = Omit<BannedUsersProps, "list" | "canvas"> & { user: BannedUser };

const BannedRow = ({ user, preview, unbanningUserId, onPreview, onUnban }: BannedRowProps) => {
  const t = useTexts(MODERATION_TEXTS);
  return (
    <WindowRow
      label={
        <MarkedProfile user={user} hasAccount={user.hasAccount} mention={t.banMention(user.isFromTwitch)} />
      }
      hasProfile
      isListed
    >
      <div className="lp-row">
        <span className="lp-type-caption lp-muted">{t.pixelCount(user.pixelCount)}</span>
        <Button
          icon={Eye}
          variant="ghost"
          title={t.seeTheirPixels}
          isPressed={preview?.userId === user.userId}
          isDisabled={user.pixelCount === 0}
          onPress={() => onPreview(user.userId)}
        />
        <Button
          label={t.unban}
          isDisabled={unbanningUserId === user.userId}
          onPress={() => onUnban(user.userId)}
        />
      </div>
    </WindowRow>
  );
};

// Ce que la fenêtre affiche : déjà résolu (le nom de l'auteur, pas juste son id), pour qu'elle n'ait plus qu'à montrer.
type ShownPreview = { displayName: string; pixels: readonly Pixel[] | null };

type PreviewWindowProps = {
  isOpen: boolean;
  shown: ShownPreview | null; // gardé par l'appelant pendant la fermeture (useShownWhileClosing)
  canvas: CanvasPreviewProps;
  onClose: () => void;
};

// L'œil ouvre cette fenêtre par-dessus la fenêtre du jeu, jamais un aperçu qui pousse la liste (JOURNAL 2026-09-27).
const PreviewWindow = ({ isOpen, shown, canvas, onClose }: PreviewWindowProps) => {
  const t = useTexts(MODERATION_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={isOpen}
      title={t.pixelsOf(shown.displayName)}
      onClose={onClose}
      actions={<Button label={design.close} kbd={design.escapeKey} onPress={onClose} />}
    >
      {shown.pixels ? (
        <PixelPreview {...canvas} pixels={shown.pixels} label={t.pixelsOf(shown.displayName)} />
      ) : (
        <span className="lp-type-caption lp-muted">{t.previewLoading}</span>
      )}
    </SmallWindow>
  );
};

const BannedRows = ({ list, preview, unbanningUserId, onPreview, onUnban }: BannedUsersProps) => {
  const t = useTexts(MODERATION_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">{design.loading}</span>;
  if (list.status === "failed") return null; // `ConnectionLost`, juste après
  if (list.users.length === 0) return <span className="lp-type-caption lp-muted">{t.nobodyBanned}</span>;
  return list.users.map((user) => (
    <BannedRow
      key={user.userId}
      user={user}
      preview={preview}
      unbanningUserId={unbanningUserId}
      onPreview={onPreview}
      onUnban={onUnban}
    />
  ));
};

export const BannedUsers = (props: BannedUsersProps) => {
  const { list, preview, canvas, onPreview } = props;
  const t = useTexts(MODERATION_TEXTS);
  const matched =
    list.status === "ready" ? list.users.find(({ userId }) => userId === preview?.userId) : undefined;
  const shown = useShownWhileClosing(
    preview && matched ? { displayName: matched.displayName, pixels: preview.pixels } : null,
  );
  const close = () => {
    if (preview) onPreview(preview.userId);
  };
  return (
    <>
      <span className="lp-type-body">{t.bannedUsers}</span>
      <BannedRows {...props} />
      <ConnectionLost isFailed={list.status === "failed"} />
      {list.status === "ready" && (
        <PreviewWindow isOpen={preview !== null} shown={shown} canvas={canvas} onClose={close} />
      )}
    </>
  );
};

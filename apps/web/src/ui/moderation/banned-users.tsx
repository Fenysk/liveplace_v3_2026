// L'onglet Modération de la fenêtre (CDC 2026, JOURNAL 2026-09-25) : les bannis, les pixels de chaque bannissement
// à l'œil, et Débannir. L'affichage seul, nourri par `useModerationTabProps`.

import type { BannedUser, Pixel } from "@liveplace/domain/ports";
import { Eye } from "lucide-react";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { Profile } from "../design/profile";
import { WindowRow } from "../design/window";
import { CONNECTION_LOST, pixelCountLabel } from "./moderation-texts";
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

type BannedRowProps = Omit<BannedUsersProps, "list"> & { user: BannedUser };

const BannedRow = ({ user, preview, unbanningUserId, canvas, onPreview, onUnban }: BannedRowProps) => {
  const isPreviewed = preview?.userId === user.userId;
  return (
    <div className="lp-col">
      <WindowRow label={<Profile user={user} variant="name" />}>
        <div className="lp-row">
          <span className="lp-type-caption lp-muted">{pixelCountLabel(user.pixelCount)}</span>
          <Button
            icon={Eye}
            variant="ghost"
            title="Voir ses pixels"
            isPressed={isPreviewed}
            isDisabled={user.pixelCount === 0}
            onPress={() => onPreview(user.userId)}
          />
          <Button
            label="Débannir"
            isDisabled={unbanningUserId === user.userId}
            onPress={() => onUnban(user.userId)}
          />
        </div>
      </WindowRow>
      {isPreviewed &&
        (preview.pixels ? (
          <PixelPreview {...canvas} pixels={preview.pixels} label={`Les pixels de ${user.displayName}`} />
        ) : (
          <span className="lp-type-caption lp-muted">Chargement de l'aperçu…</span>
        ))}
    </div>
  );
};

const listContent = ({ list, ...row }: BannedUsersProps) => {
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">Chargement…</span>;
  if (list.status === "failed") return <span className="lp-type-caption lp-danger">{CONNECTION_LOST}</span>;
  if (list.users.length === 0) return <span className="lp-type-caption lp-muted">Personne n'est banni.</span>;
  return list.users.map((user) => <BannedRow key={user.userId} {...row} user={user} />);
};

export const BannedUsers = (props: BannedUsersProps) => (
  <>
    <span className="lp-type-body">Utilisateurs bannis</span>
    {listContent(props)}
  </>
);

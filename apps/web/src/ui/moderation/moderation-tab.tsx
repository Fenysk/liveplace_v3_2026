// L'onglet Modération, branché sur le store (JOURNAL 2026-09-25) : monté à l'ouverture de l'onglet, il relit alors
// la liste des bannis, et celle des modérateurs avec l'état de la synchro Twitch (JOURNAL 2026-09-27).
// L'affichage est dans `banned-users.tsx`, `moderator-users.tsx` et `twitch-sync.tsx`.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { syncHref } from "../account/auth-links";
import { type BannedList, BannedUsers, type BanPreview } from "./banned-users";
import { type ModeratorListView, ModeratorUsers } from "./moderator-users";
import { TwitchSyncBlock, type TwitchSyncView } from "./twitch-sync";

// `onSync` : la page part chez Twitch, la pill Dessin le dit (use-signing-in.ts).
type ModerationTabProps = { canvas: CanvasStore; login: string; onSync: () => void };

type ModeratorsAnswer = Awaited<ReturnType<CanvasStore["listModerators"]>>;

// La réponse `moderators`, à la lecture comme au retrait : la liste, et l'état de la synchro Twitch.
const viewsOf = (result: ModeratorsAnswer): { moderators: ModeratorListView; sync: TwitchSyncView } => ({
  moderators: result.ok ? { status: "ready", users: result.value.users } : { status: "failed" },
  sync: result.ok && result.value.twitchSync ? result.value.twitchSync : { status: "never" },
});

const useModeratorsProps = (canvas: CanvasStore) => {
  const [views, setViews] = useState<{ moderators: ModeratorListView; sync: TwitchSyncView }>({
    moderators: { status: "loading" },
    sync: { status: "loading" },
  });
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  useEffect(() => {
    void canvas.listModerators().then((result) => setViews(viewsOf(result)));
  }, [canvas]);

  // Le streamer retire un modérateur qu'il a nommé ici : la réponse est la liste à jour.
  const onRemove = (userId: string) => {
    setRemovingUserId(userId);
    void canvas.setModerator(userId, false).then((result) => {
      setRemovingUserId(null);
      setViews(viewsOf(result));
    });
  };

  return { ...views, removingUserId, onRemove };
};

const useModerationTabProps = (canvas: CanvasStore) => {
  const { width, height, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const [list, setList] = useState<BannedList>({ status: "loading" });
  const [preview, setPreview] = useState<BanPreview | null>(null);
  const [unbanningUserId, setUnbanningUserId] = useState<string | null>(null);

  useEffect(() => {
    void canvas.listBans().then((result) => {
      setList(result.ok ? { status: "ready", users: result.value } : { status: "failed" });
    });
  }, [canvas]);

  const onPreview = (userId: string) => {
    if (preview?.userId === userId) return setPreview(null);
    setPreview({ userId, pixels: null });
    void canvas.listPixels(userId).then((result) => {
      // Un autre œil ouvert entre-temps garde le sien.
      setPreview((shown) =>
        shown?.userId === userId ? { userId, pixels: result.ok ? result.value : [] } : shown,
      );
    });
  };

  const onUnban = (userId: string) => {
    setUnbanningUserId(userId);
    void canvas.moderate({ action: "unban", target: userId }).then((result) => {
      setUnbanningUserId(null);
      if (!result.ok) return setList({ status: "failed" });
      setList((shown) =>
        shown.status === "ready"
          ? { status: "ready", users: shown.users.filter((user) => user.userId !== userId) }
          : shown,
      );
      setPreview((shown) => (shown?.userId === userId ? null : shown));
    });
  };

  return { list, preview, unbanningUserId, canvas: { width, height, palette }, onPreview, onUnban };
};

export const ModerationTab = ({ canvas, login, onSync }: ModerationTabProps) => {
  const { role } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { moderators, sync, removingUserId, onRemove } = useModeratorsProps(canvas);
  const isOwner = role === "owner";
  return (
    <>
      {isOwner && <TwitchSyncBlock sync={sync} syncHref={syncHref(login)} onSync={onSync} />}
      <ModeratorUsers
        list={moderators}
        removingUserId={removingUserId}
        onRemove={isOwner ? onRemove : undefined}
      />
      <BannedUsers {...useModerationTabProps(canvas)} />
    </>
  );
};

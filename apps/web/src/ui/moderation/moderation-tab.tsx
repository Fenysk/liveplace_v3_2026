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

const useModeratorsProps = (canvas: CanvasStore) => {
  const [moderators, setModerators] = useState<ModeratorListView>({ status: "loading" });
  const [sync, setSync] = useState<TwitchSyncView>({ status: "loading" });
  useEffect(() => {
    void canvas.listModerators().then((result) => {
      setModerators(result.ok ? { status: "ready", users: result.value.users } : { status: "failed" });
      setSync(result.ok && result.value.twitchSync ? result.value.twitchSync : { status: "never" });
    });
  }, [canvas]);
  return { moderators, sync };
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
  const { moderators, sync } = useModeratorsProps(canvas);
  return (
    <>
      {role === "owner" && <TwitchSyncBlock sync={sync} syncHref={syncHref(login)} onSync={onSync} />}
      <ModeratorUsers list={moderators} />
      <BannedUsers {...useModerationTabProps(canvas)} />
    </>
  );
};

// L'onglet Modération, branché sur le store (JOURNAL 2026-09-25) : monté à l'ouverture de l'onglet, il relit alors
// la liste des modérateurs avec l'état de la synchro Twitch (JOURNAL 2026-09-27). Les signalements et les bannis se
// relisent aussi à chaque changement du nombre de signalements : bannir depuis un signalement les change tous deux
// (JOURNAL 2026-09-28).
// L'affichage est dans `reported-placements.tsx`, `banned-users.tsx`, `moderator-users.tsx` et `twitch-sync.tsx`.

import type { ReportedPlacement } from "@liveplace/domain/ports";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { syncHref } from "../account/auth-links";
import { type BannedList, BannedUsers, type BanPreview } from "./banned-users";
import { type ModeratorListView, ModeratorUsers } from "./moderator-users";
import { ReportedPlacements, type ReportList } from "./reported-placements";
import { TwitchSyncBlock, type TwitchSyncView } from "./twitch-sync";
import type { ModerationControls } from "./use-moderation";

// `onSync` : la page part chez Twitch, la pill Dessin le dit (use-signing-in.ts). `onModerate` : la fenêtre de
// confirmation de la page, par-dessus celle-ci.
type ModerationTabProps = {
  canvas: CanvasStore;
  login: string;
  onSync: () => void;
  onModerate: ModerationControls["onModerate"];
};

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

// `relist` à l'ouverture de l'onglet, puis à chaque signalement ou décision, ici ou chez un autre modérateur.
const useRelistOnReports = (canvas: CanvasStore, relist: () => void) => {
  useEffect(() => {
    let listedCount: number | null = null;
    const relistIfChanged = () => {
      const { reportCount } = canvas.getView();
      if (reportCount === listedCount) return;
      listedCount = reportCount;
      relist();
    };
    relistIfChanged();
    return canvas.subscribe(relistIfChanged);
  }, [canvas, relist]);
};

const useReportsProps = (canvas: CanvasStore, onModerate: ModerationControls["onModerate"]) => {
  const { width, height, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const [list, setList] = useState<ReportList>({ status: "loading" });
  const [approvingPlacementId, setApprovingPlacementId] = useState<string | null>(null);

  const relist = useCallback(() => {
    void canvas.listReports().then((result) => {
      setList(result.ok ? { status: "ready", reports: result.value } : { status: "failed" });
    });
  }, [canvas]);
  useRelistOnReports(canvas, relist);

  const onApprove = ({ userId, placementId }: ReportedPlacement) => {
    setApprovingPlacementId(placementId);
    void canvas.moderate({ action: "approvePlacement", target: userId, placementId }).then((result) => {
      setApprovingPlacementId(null);
      if (!result.ok) setList({ status: "failed" });
    });
  };

  return {
    list,
    approvingPlacementId,
    canvas: { width, height, palette },
    nowMs: Date.now(),
    onClear: (report: ReportedPlacement) => onModerate("clear", report),
    onBan: (report: ReportedPlacement) => onModerate("ban", report),
    onApprove,
  };
};

const useModerationTabProps = (canvas: CanvasStore) => {
  const { width, height, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const [list, setList] = useState<BannedList>({ status: "loading" });
  const [preview, setPreview] = useState<BanPreview | null>(null);
  const [unbanningUserId, setUnbanningUserId] = useState<string | null>(null);

  const relist = useCallback(() => {
    void canvas.listBans().then((result) => {
      setList(result.ok ? { status: "ready", users: result.value } : { status: "failed" });
    });
  }, [canvas]);
  useRelistOnReports(canvas, relist);

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

export const ModerationTab = ({ canvas, login, onSync, onModerate }: ModerationTabProps) => {
  const { role } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const { moderators, sync, removingUserId, onRemove } = useModeratorsProps(canvas);
  const isOwner = role === "owner";
  return (
    <>
      <ReportedPlacements {...useReportsProps(canvas, onModerate)} />
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

// L'onglet Modération, branché sur le store (JOURNAL 2026-09-25) : monté à l'ouverture de l'onglet, il relit alors
// la liste des modérateurs avec l'état de la synchro Twitch (JOURNAL 2026-09-27). Les signalements et les bannis se
// relisent aussi à chaque changement du nombre de signalements : bannir depuis un signalement les change tous deux
// (JOURNAL 2026-09-28). Un signalement de plage n'a qu'une ligne, ses poses réunies ici (JOURNAL 2026-10-07). Les
// bannis et les modérateurs se relisent enfin quand le gateway dit leur liste périmée, un ban ou un rôle venu de
// Twitch ou d'un autre modérateur (JOURNAL 2026-10-06).
// L'affichage est dans `reported-placements.tsx`, `banned-users.tsx`, `moderator-users.tsx` et `twitch-sync.tsx`.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CanvasStore, StaleList } from "../../state/canvas-store";
import { syncHref } from "../account/auth-links";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import { type BannedList, BannedUsers, type BanPreview } from "./banned-users";
import { moderateInOrder } from "./moderate-in-order";
import { MODERATION_TEXTS } from "./moderation-texts";
import { type ModeratorListView, ModeratorUsers } from "./moderator-users";
import { oneAtATime } from "./one-at-a-time";
import { type PendingReport, pendingReportKey, toPendingReports } from "./pending-reports";
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

// `relist` à chaque fois que le gateway dit cette liste périmée, et à la reprise de la socket (JOURNAL 2026-10-06).
const useRelistOnStale = (canvas: CanvasStore, list: StaleList, relist: () => void) => {
  useEffect(
    () =>
      canvas.listenStaleLists((stale) => {
        if (stale === list) relist();
      }),
    [canvas, list, relist],
  );
};

const useModeratorsProps = (canvas: CanvasStore) => {
  const [views, setViews] = useState<{ moderators: ModeratorListView; sync: TwitchSyncView }>({
    moderators: { status: "loading" },
    sync: { status: "loading" },
  });
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const toast = useToast();
  const t = useTexts(MODERATION_TEXTS);

  const relist = useMemo(
    () =>
      oneAtATime(async () => {
        setViews(viewsOf(await canvas.listModerators()));
      }),
    [canvas],
  );
  useEffect(relist, [relist]);
  useRelistOnStale(canvas, "moderators", relist);

  // Le streamer retire un modérateur qu'il a nommé ici : la réponse est la liste à jour.
  const onRemove = (userId: string) => {
    setRemovingUserId(userId);
    void canvas.setModerator(userId, false).then((result) => {
      setRemovingUserId(null);
      setViews(viewsOf(result));
      if (result.ok) toast("success", t.moderatorRemoved);
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
  const [approvingReportKey, setApprovingReportKey] = useState<string | null>(null);
  const toast = useToast();
  const t = useTexts(MODERATION_TEXTS);

  const relist = useCallback(() => {
    void canvas.listReports().then((result) => {
      setList(
        result.ok ? { status: "ready", reports: toPendingReports(result.value) } : { status: "failed" },
      );
    });
  }, [canvas]);
  useRelistOnReports(canvas, relist);

  // Une pose après l'autre, un seul toast à la fin (JOURNAL 2026-10-07).
  const approve = async (report: PendingReport): Promise<void> => {
    setApprovingReportKey(pendingReportKey(report));
    const result = await moderateInOrder(
      canvas,
      report.placementIds.map((placementId) => ({
        action: "approvePlacement",
        target: report.userId,
        placementId,
      })),
    );
    setApprovingReportKey(null);
    if (!result.ok) return setList({ status: "failed" });
    toast("success", t.approvedToast(report.placementIds.length));
  };

  return {
    list,
    approvingReportKey,
    canvas: { width, height, palette },
    nowMs: Date.now(),
    onClear: (report: PendingReport) => onModerate("clear", report),
    onBan: (report: PendingReport) => onModerate("ban", report),
    onApprove: (report: PendingReport) => void approve(report),
  };
};

const useModerationTabProps = (canvas: CanvasStore) => {
  const { width, height, palette } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const [list, setList] = useState<BannedList>({ status: "loading" });
  const [preview, setPreview] = useState<BanPreview | null>(null);
  const [unbanningUserId, setUnbanningUserId] = useState<string | null>(null);
  const toast = useToast();
  const t = useTexts(MODERATION_TEXTS);

  const relist = useMemo(
    () =>
      oneAtATime(async () => {
        const result = await canvas.listBans();
        setList(result.ok ? { status: "ready", users: result.value } : { status: "failed" });
      }),
    [canvas],
  );
  useRelistOnReports(canvas, relist);
  useRelistOnStale(canvas, "bans", relist);

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
      toast("success", t.unbanned);
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

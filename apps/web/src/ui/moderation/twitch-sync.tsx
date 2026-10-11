// « Synchroniser avec Twitch », pour le streamer, dans l'onglet Modération (JOURNAL 2026-09-27) : l'état de la
// synchro, et le bouton qui part chez Twitch demander le droit de lire ses modérateurs et ses bans.

import type { TwitchSync } from "@liveplace/domain/ports";
import { SkeletonBar, SkeletonSwap } from "../design/skeleton";
import { SignInButton } from "../design/twitch";
import { formatDateTime } from "../locale/locale";
import { useLocale, useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "./moderation-texts";

// `never` : jamais synchronisé. `loading` : la réponse du gateway n'est pas encore là.
export type TwitchSyncView = { status: "loading" } | { status: "never" } | TwitchSync;

// La phrase tient sur deux lignes dans la fenêtre : la forme de deux lignes.
const SyncSkeleton = () => (
  <div className="lp-skeleton-lines">
    <SkeletonBar text="caption" width="full" />
    <SkeletonBar text="caption" width="long" />
  </div>
);

type TwitchSyncBlockProps = { sync: TwitchSyncView; syncHref: string; onSync?: (() => void) | undefined };

export const TwitchSyncBlock = ({ sync, syncHref, onSync }: TwitchSyncBlockProps) => {
  const locale = useLocale();
  const t = useTexts(MODERATION_TEXTS);
  const syncText = (done: Exclude<TwitchSyncView, { status: "loading" }>): string => {
    switch (done.status) {
      case "never":
        return t.syncNever;
      case "ok":
        return t.syncOk(formatDateTime(done.syncedAt, locale));
      case "revoked":
        return t.syncRevoked;
    }
  };
  return (
    <div className="lp-setting">
      <span className="lp-type-body">{t.twitchSync}</span>
      <SkeletonSwap isLoading={sync.status === "loading"} skeleton={<SyncSkeleton />}>
        {sync.status !== "loading" && <p className="lp-type-caption lp-muted">{syncText(sync)}</p>}
      </SkeletonSwap>
      <div className="lp-row">
        <SignInButton
          href={syncHref}
          label={sync.status === "never" ? t.syncWithTwitch : t.syncAgain}
          onPress={onSync}
        />
      </div>
    </div>
  );
};

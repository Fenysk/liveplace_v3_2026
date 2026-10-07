// « Synchroniser avec Twitch », pour le streamer, dans l'onglet Modération (JOURNAL 2026-09-27) : l'état de la
// synchro, et le bouton qui part chez Twitch demander le droit de lire ses modérateurs et ses bans.

import type { TwitchSync } from "@liveplace/domain/ports";
import { SignInButton } from "../design/twitch";
import { formatDateTime } from "../locale/locale";
import { useLocale, useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "./moderation-texts";

// `never` : jamais synchronisé. `loading` : la réponse du gateway n'est pas encore là.
export type TwitchSyncView = { status: "loading" } | { status: "never" } | TwitchSync;

type TwitchSyncBlockProps = { sync: TwitchSyncView; syncHref: string; onSync?: (() => void) | undefined };

export const TwitchSyncBlock = ({ sync, syncHref, onSync }: TwitchSyncBlockProps) => {
  const locale = useLocale();
  const t = useTexts(MODERATION_TEXTS);
  const syncText = (): string => {
    switch (sync.status) {
      case "loading":
        return "…";
      case "never":
        return t.syncNever;
      case "ok":
        return t.syncOk(formatDateTime(sync.syncedAt, locale));
      case "revoked":
        return t.syncRevoked;
    }
  };
  return (
    <div className="lp-setting">
      <span className="lp-type-body">{t.twitchSync}</span>
      <p className="lp-type-caption lp-muted">{syncText()}</p>
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

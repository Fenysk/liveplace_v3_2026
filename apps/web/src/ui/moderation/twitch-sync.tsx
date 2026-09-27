// « Synchroniser avec Twitch », pour le streamer, dans l'onglet Modération (JOURNAL 2026-09-27) : l'état de la
// synchro, et le bouton qui part chez Twitch demander le droit de lire ses modérateurs et ses bans.

import type { TwitchSync } from "@liveplace/domain/ports";
import { SignInButton } from "../design/twitch";

// `never` : jamais synchronisé. `loading` : la réponse du gateway n'est pas encore là.
export type TwitchSyncView = { status: "loading" } | { status: "never" } | TwitchSync;

const SYNCED_AT_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

const syncText = (sync: TwitchSyncView): string => {
  switch (sync.status) {
    case "loading":
      return "…";
    case "never":
      return "Tes modérateurs et tes bannis Twitch le deviennent ici, et le restent quand tu changes quelque chose sur Twitch. LivePlace ne fait que les lire.";
    case "ok":
      return `Synchronisé le ${SYNCED_AT_FORMAT.format(sync.syncedAt)}. Chaque changement sur Twitch arrive ici tout seul.`;
    case "revoked":
      return "Tu as retiré l'accès de LivePlace sur Twitch : les changements n'arrivent plus. Synchronise de nouveau.";
  }
};

type TwitchSyncBlockProps = { sync: TwitchSyncView; syncHref: string; onSync?: (() => void) | undefined };

export const TwitchSyncBlock = ({ sync, syncHref, onSync }: TwitchSyncBlockProps) => (
  <div className="lp-setting">
    <span className="lp-type-body">Synchronisation Twitch</span>
    <p className="lp-type-caption lp-muted">{syncText(sync)}</p>
    <div className="lp-row">
      <SignInButton
        href={syncHref}
        label={sync.status === "never" ? "Synchroniser avec Twitch" : "Synchroniser de nouveau"}
        onPress={onSync}
      />
    </div>
  </div>
);

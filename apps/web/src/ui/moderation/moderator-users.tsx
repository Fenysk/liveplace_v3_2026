// Les modérateurs du canvas, dans l'onglet Modération (JOURNAL 2026-09-27) : d'où ils viennent, et ceux qui n'ont
// pas encore de compte. L'affichage seul, nourri par `useModerationTabProps`.

import type { Moderator } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { SkeletonRows, SkeletonSwap } from "../design/skeleton";
import { WindowRow } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { ConnectionLost } from "./connection-lost";
import { MarkedProfile } from "./marked-profile";
import { MODERATION_TEXTS } from "./moderation-texts";
import { RowFailure } from "./row-failure";

export type ModeratorListView =
  | { status: "loading" }
  | { status: "ready"; users: readonly Moderator[] }
  | { status: "failed" };

// `onRemove` : pour le streamer seul, sur ceux qu'il a nommés ici (JOURNAL 2026-09-27).
type ModeratorUsersProps = {
  list: ModeratorListView;
  removingUserId?: string | null | undefined; // Retirer attend sa réponse
  failedUserId?: string | null | undefined; // Retirer a échoué : la ligne le dit, la liste reste (Écart §8.1, JOURNAL 2026-10-13)
  onRemove?: ((userId: string) => void) | undefined;
};

const ModeratorRows = ({ list, removingUserId, failedUserId, onRemove }: ModeratorUsersProps) => {
  const t = useTexts(MODERATION_TEXTS);
  // `failed` : rien, `ConnectionLost` le dit juste après.
  return (
    <SkeletonSwap
      isLoading={list.status === "loading"}
      skeleton={<SkeletonRows kind="profile" />}
      hasOwnArrival
    >
      {list.status === "ready" &&
        (list.users.length === 0 ? (
          <span className="lp-type-caption lp-muted">{t.noModerators}</span>
        ) : (
          list.users.map((user) => (
            <WindowRow
              key={user.userId}
              label={
                <MarkedProfile user={user} hasAccount={user.hasAccount} mention={t.moderatorMention(user)} />
              }
              hasProfile
              isListed
              isFailed={failedUserId === user.userId}
            >
              {onRemove && user.isNamedHere && (
                <>
                  <Button
                    label={t.removeModerator}
                    isDisabled={removingUserId === user.userId}
                    onPress={() => onRemove(user.userId)}
                  />
                  <RowFailure isFailed={failedUserId === user.userId} onRetry={() => onRemove(user.userId)} />
                </>
              )}
            </WindowRow>
          ))
        ))}
    </SkeletonSwap>
  );
};

export const ModeratorUsers = (props: ModeratorUsersProps) => {
  const t = useTexts(MODERATION_TEXTS);
  return (
    <>
      <span className="lp-type-body">{t.moderators}</span>
      <ModeratorRows {...props} />
      <ConnectionLost isFailed={props.list.status === "failed"} />
    </>
  );
};

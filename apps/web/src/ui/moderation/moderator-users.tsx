// Les modérateurs du canvas, dans l'onglet Modération (JOURNAL 2026-09-27) : d'où ils viennent, et ceux qui n'ont
// pas encore de compte. L'affichage seul, nourri par `useModerationTabProps`.

import type { Moderator } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { WindowRow } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { ConnectionLost } from "./connection-lost";
import { MarkedProfile } from "./marked-profile";
import { MODERATION_TEXTS } from "./moderation-texts";

export type ModeratorListView =
  | { status: "loading" }
  | { status: "ready"; users: readonly Moderator[] }
  | { status: "failed" };

// `onRemove` : pour le streamer seul, sur ceux qu'il a nommés ici (JOURNAL 2026-09-27).
type ModeratorUsersProps = {
  list: ModeratorListView;
  removingUserId?: string | null | undefined; // Retirer attend sa réponse
  onRemove?: ((userId: string) => void) | undefined;
};

const ModeratorRows = ({ list, removingUserId, onRemove }: ModeratorUsersProps) => {
  const t = useTexts(MODERATION_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">{design.loading}</span>;
  if (list.status === "failed") return null; // `ConnectionLost`, juste après
  if (list.users.length === 0) return <span className="lp-type-caption lp-muted">{t.noModerators}</span>;
  return list.users.map((user) => (
    <WindowRow
      key={user.userId}
      label={<MarkedProfile user={user} hasAccount={user.hasAccount} mention={t.moderatorMention(user)} />}
      hasProfile
      isListed
    >
      {onRemove && user.isNamedHere && (
        <Button
          label={t.removeModerator}
          isDisabled={removingUserId === user.userId}
          onPress={() => onRemove(user.userId)}
        />
      )}
    </WindowRow>
  ));
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

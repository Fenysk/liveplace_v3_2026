// Les modérateurs du canvas, dans l'onglet Modération (JOURNAL 2026-09-27) : d'où ils viennent, et ceux qui n'ont
// pas encore de compte. L'affichage seul, nourri par `useModerationTabProps`.

import type { Moderator } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { WindowRow } from "../design/window";
import { MarkedProfile } from "./marked-profile";
import { CONNECTION_LOST, moderatorMention } from "./moderation-texts";

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

const listContent = ({ list, removingUserId, onRemove }: ModeratorUsersProps) => {
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">Chargement…</span>;
  if (list.status === "failed") return <span className="lp-type-caption lp-danger">{CONNECTION_LOST}</span>;
  if (list.users.length === 0) return <span className="lp-type-caption lp-muted">Aucun modérateur.</span>;
  return list.users.map((user) => (
    <WindowRow
      key={user.userId}
      label={<MarkedProfile user={user} hasAccount={user.hasAccount} mention={moderatorMention(user)} />}
      hasProfile
    >
      {onRemove && user.isNamedHere && (
        <Button
          label="Retirer"
          isDisabled={removingUserId === user.userId}
          onPress={() => onRemove(user.userId)}
        />
      )}
    </WindowRow>
  ));
};

export const ModeratorUsers = (props: ModeratorUsersProps) => (
  <>
    <span className="lp-type-body">Modérateurs</span>
    {listContent(props)}
  </>
);

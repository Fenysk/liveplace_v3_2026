// Les modérateurs du canvas, dans l'onglet Modération (JOURNAL 2026-09-27) : d'où ils viennent, et ceux qui n'ont
// pas encore de compte. L'affichage seul, nourri par `useModerationTabProps`.

import type { Moderator } from "@liveplace/domain/ports";
import { WindowRow } from "../design/window";
import { MarkedProfile } from "./marked-profile";
import { CONNECTION_LOST } from "./moderation-texts";

export type ModeratorListView =
  | { status: "loading" }
  | { status: "ready"; users: readonly Moderator[] }
  | { status: "failed" };

type ModeratorUsersProps = { list: ModeratorListView };

const listContent = ({ list }: ModeratorUsersProps) => {
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">Chargement…</span>;
  if (list.status === "failed") return <span className="lp-type-caption lp-danger">{CONNECTION_LOST}</span>;
  if (list.users.length === 0) return <span className="lp-type-caption lp-muted">Aucun modérateur.</span>;
  return list.users.map((user) => (
    <WindowRow key={user.userId} label={<MarkedProfile {...user} user={user} />}>
      {null}
    </WindowRow>
  ));
};

export const ModeratorUsers = (props: ModeratorUsersProps) => (
  <>
    <span className="lp-type-body">Modérateurs</span>
    {listContent(props)}
  </>
);

// Un modérateur ou un banni, dans l'onglet Modération : son profil, et sous son nom une mention qui dit d'où vient son
// rôle ou son ban (« Modérateur sur Twitch et LivePlace »…), plutôt que des étiquettes à décoder. Sans compte
// LivePlace, `Profile` le dit par le contour de l'avatar et garde le bouton de sa chaîne Twitch (JOURNAL 2026-09-27).

import { DeletedProfile, Profile, type ProfileUser } from "../design/profile";

type MarkedProfileProps = {
  user: ProfileUser;
  hasAccount: boolean;
  mention?: string | undefined;
  isDeleted?: boolean | undefined; // CDC §8 : un compte supprimé n'a ni nom ni photo, « Compte supprimé »
};

export const MarkedProfile = ({ user, hasAccount, mention, isDeleted }: MarkedProfileProps) => (
  <span className="lp-marked">
    {isDeleted ? <DeletedProfile /> : <Profile user={user} variant="name" hasAccount={hasAccount} />}
    {mention && <span className="lp-marked-mention lp-type-caption lp-muted">{mention}</span>}
  </span>
);

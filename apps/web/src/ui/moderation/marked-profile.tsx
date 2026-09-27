// Ce qu'on dit d'un modérateur ou d'un banni juste après son nom (JOURNAL 2026-09-27) : d'où il vient, et s'il n'a
// pas encore de compte LivePlace.

import { Badge } from "../design/badge";
import { Profile, type ProfileUser } from "../design/profile";
import { TwitchGlyph } from "../design/twitch";

type MarkedProfileProps = {
  user: ProfileUser;
  isFromTwitch: boolean;
  isNamedHere?: boolean;
  hasAccount: boolean;
};

export const MarkedProfile = ({
  user,
  isFromTwitch,
  isNamedHere = false,
  hasAccount,
}: MarkedProfileProps) => (
  <span className="lp-row">
    <Profile user={user} variant="name" />
    {isFromTwitch && <Badge label="Twitch" icon={TwitchGlyph} title="Venu de ta chaîne Twitch" />}
    {isNamedHere && <Badge label="Nommé ici" />}
    {!hasAccount && <Badge label="Sans compte" title="Pas encore sur LivePlace" />}
  </span>
);

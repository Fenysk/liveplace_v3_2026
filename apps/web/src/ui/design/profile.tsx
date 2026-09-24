// L'identité d'un utilisateur (CDC 2026, Profils) : sa photo Twitch, ou son initiale si elle manque ou ne charge pas.
// L'avatar et le nom mènent à son canvas ; seule l'icône Twitch mène à sa chaîne.

import { useState } from "react";
import { Button, blurAfterClick } from "./button";
import { TwitchGlyph } from "./twitch";

export type ProfileUser = { displayName: string; login: string; avatarUrl?: string | undefined };

// `avatar` : la photo seule. `name` : la photo et le nom. `full` : la photo, le nom et l'icône Twitch.
export type ProfileVariant = "avatar" | "name" | "full";

type AvatarProps = Pick<ProfileUser, "displayName" | "avatarUrl">;

// La photo cassée se retient par adresse : une nouvelle photo retente sa chance.
export const Avatar = ({ displayName, avatarUrl }: AvatarProps) => {
  const [brokenUrl, setBrokenUrl] = useState<string>();
  const isPhotoShown = avatarUrl !== undefined && avatarUrl !== brokenUrl;
  return (
    <span className="lp-avatar lp-type-title" aria-hidden="true">
      {displayName.charAt(0).toUpperCase()}
      {isPhotoShown && (
        <img
          className="lp-avatar-img"
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBrokenUrl(avatarUrl)}
        />
      )}
    </span>
  );
};

type ProfileProps = { user: ProfileUser; variant?: ProfileVariant };

export const Profile = ({ user, variant = "name" }: ProfileProps) => {
  const canvasLabel = `Voir le canvas de ${user.displayName}`;
  return (
    <span className="lp-profile">
      <a
        className="lp-profile-main"
        href={`/${encodeURIComponent(user.login)}`}
        title={canvasLabel}
        aria-label={canvasLabel}
      >
        <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
        {variant !== "avatar" && <span className="lp-profile-name lp-type-title">{user.displayName}</span>}
      </a>
      {variant === "full" && (
        <Button
          icon={TwitchGlyph}
          variant="ghost"
          title={`Chaîne Twitch de ${user.displayName}`}
          href={`https://www.twitch.tv/${encodeURIComponent(user.login)}`}
          isNewTab
        />
      )}
    </span>
  );
};

// Dans la pill Compte, sa propre photo n'est pas un profil : c'est le bouton Mon compte.
type AvatarButtonProps = { user: AvatarProps; title: string; onPress: () => void };

export const AvatarButton = ({ user, title, onPress }: AvatarButtonProps) => (
  <button
    type="button"
    className="lp-btn lp-avatar-btn"
    title={title}
    aria-label={title}
    onClick={blurAfterClick(onPress)}
  >
    <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
  </button>
);

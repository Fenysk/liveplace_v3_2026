// L'identité d'un utilisateur (CDC 2026, Profils) : sa photo Twitch, ou son initiale si elle manque ou ne charge pas.
// L'avatar et le nom mènent à son canvas ; seule l'icône Twitch mène à sa chaîne.
// Sans compte LivePlace (JOURNAL 2026-09-27) : pas de canvas à montrer, l'avatar se distingue par son contour, le
// clic ouvre une petite fenêtre qui le dit plutôt que de naviguer, et la chaîne Twitch reste le seul lien qui mène
// quelque part.

import { useState } from "react";
import { Button, blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { TwitchGlyph } from "./twitch";
import { SmallWindow } from "./window";

export type ProfileUser = { displayName: string; login: string; avatarUrl?: string | undefined };

// `avatar` : la photo seule. `name` : la photo et le nom. `full` : la photo, le nom et l'icône Twitch.
export type ProfileVariant = "avatar" | "name" | "full";

type AvatarProps = Pick<ProfileUser, "displayName" | "avatarUrl"> & { hasAccount?: boolean };

// La photo cassée se retient par adresse : une nouvelle photo retente sa chance.
export const Avatar = ({ displayName, avatarUrl, hasAccount = true }: AvatarProps) => {
  const [brokenUrl, setBrokenUrl] = useState<string>();
  const isPhotoShown = avatarUrl !== undefined && avatarUrl !== brokenUrl;
  return (
    <span
      className={classNames("lp-avatar lp-type-title", !hasAccount && "lp-avatar--no-account")}
      aria-hidden="true"
    >
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

type ProfileProps = { user: ProfileUser; variant?: ProfileVariant; hasAccount?: boolean };

export const Profile = ({ user, variant = "name", hasAccount = true }: ProfileProps) => {
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const closeError = () => setIsErrorOpen(false);

  const inner = (
    <>
      <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} hasAccount={hasAccount} />
      {variant !== "avatar" && <span className="lp-profile-name lp-type-title">{user.displayName}</span>}
    </>
  );

  return (
    <span className="lp-profile">
      {hasAccount ? (
        <a
          className="lp-profile-main"
          href={`/${encodeURIComponent(user.login)}`}
          title={`Voir le canvas de ${user.displayName}`}
          aria-label={`Voir le canvas de ${user.displayName}`}
        >
          {inner}
        </a>
      ) : (
        <button
          type="button"
          className="lp-profile-main"
          onClick={blurAfterClick(() => setIsErrorOpen(true))}
        >
          {inner}
        </button>
      )}
      {(variant === "full" || !hasAccount) && (
        <Button
          icon={TwitchGlyph}
          variant="ghost"
          title={`Chaîne Twitch de ${user.displayName}`}
          href={`https://www.twitch.tv/${encodeURIComponent(user.login)}`}
          isNewTab
        />
      )}
      {!hasAccount && (
        <SmallWindow
          isOpen={isErrorOpen}
          title={user.displayName}
          onClose={closeError}
          actions={<Button label="Fermer" kbd="Échap" onPress={closeError} />}
        >
          <p className="lp-type-body lp-prompt">Cette personne n'a pas de compte LivePlace.</p>
        </SmallWindow>
      )}
    </span>
  );
};

// Dans la pill Compte, sa propre photo n'est pas un profil : c'est le bouton Mon compte.
// `hasDot` : quelque chose l'attend, un signalement pour qui modère (JOURNAL 2026-09-28) ; `title` le dit.
type AvatarButtonProps = { user: AvatarProps; title: string; onPress: () => void; hasDot?: boolean };

export const AvatarButton = ({ user, title, onPress, hasDot = false }: AvatarButtonProps) => (
  <button
    type="button"
    className="lp-btn lp-avatar-btn"
    title={title}
    aria-label={title}
    onClick={blurAfterClick(onPress)}
  >
    <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
    {hasDot && <span className="lp-avatar-dot" aria-hidden="true" />}
  </button>
);

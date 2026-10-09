// L'identité d'un utilisateur (CDC 2026, Profils) : sa photo Twitch, ou son initiale si elle manque ou ne charge pas.
// L'avatar et le nom mènent à son canvas ; seule l'icône Twitch mène à sa chaîne.
// Sans compte LivePlace (JOURNAL 2026-09-27) : pas de canvas à montrer, l'avatar se distingue par son contour, le
// clic ouvre une petite fenêtre qui le dit plutôt que de naviguer, et la chaîne Twitch reste le seul lien qui mène
// quelque part.

import type { TwitchLive } from "@liveplace/domain/ports";
import { useState } from "react";
import { useTexts } from "../locale/use-locale";
import { Button, blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";
import { TwitchGlyph, TwitchLiveGlyph } from "./twitch";
import { SmallWindow } from "./window";

// `twitchLive` (Écart §4, JOURNAL 2026-10-07) : la personne est en live ; le bouton de sa chaîne le dit. Absent : hors live.
export type ProfileUser = {
  displayName: string;
  login: string;
  avatarUrl?: string | undefined;
  twitchLive?: TwitchLive | undefined;
};

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

// Le bouton de la chaîne d'un compte en live : le logo, puis la catégorie du stream. L'infobulle dit tout.
const TwitchLiveLink = ({ user, twitchLive }: { user: ProfileUser; twitchLive: TwitchLive }) => {
  const t = useTexts(DESIGN_TEXTS);
  const { category } = twitchLive;
  const title = t.liveOnTwitch(user.displayName, category);
  return (
    <a
      className="lp-btn lp-btn--live lp-type-caption"
      href={`https://www.twitch.tv/${encodeURIComponent(user.login)}`}
      title={title}
      aria-label={title}
      target="_blank"
      rel="noopener noreferrer"
    >
      <TwitchLiveGlyph />
      <span className="lp-live-category">{category || t.liveLabel}</span>
    </a>
  );
};

type ProfileProps = { user: ProfileUser; variant?: ProfileVariant; hasAccount?: boolean };

export const Profile = ({ user, variant = "name", hasAccount = true }: ProfileProps) => {
  const t = useTexts(DESIGN_TEXTS);
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
          title={t.viewCanvasOf(user.displayName)}
          aria-label={t.viewCanvasOf(user.displayName)}
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
      {/* Écart §4 (JOURNAL 2026-10-07) : en live, le bouton teinté paraît même sans logo (mobile) ; seule une personne avec compte l'est */}
      {user.twitchLive && hasAccount ? (
        <TwitchLiveLink user={user} twitchLive={user.twitchLive} />
      ) : (
        (variant === "full" || !hasAccount) && (
          <Button
            icon={TwitchGlyph}
            variant="ghost"
            title={t.twitchChannelOf(user.displayName)}
            href={`https://www.twitch.tv/${encodeURIComponent(user.login)}`}
            isNewTab
          />
        )
      )}
      {!hasAccount && (
        <SmallWindow
          isOpen={isErrorOpen}
          title={user.displayName}
          onClose={closeError}
          actions={<Button label={t.close} kbd={t.escapeKey} onPress={closeError} />}
        >
          <p className="lp-type-body lp-prompt">{t.noAccount}</p>
        </SmallWindow>
      )}
    </span>
  );
};

// Dans la pill Compte, sa propre photo n'est pas un profil : c'est le bouton Mon compte.
// `hasDot` : quelque chose l'attend, un signalement pour qui modère (JOURNAL 2026-09-28) ; `title` le dit.
// `isLive` (Écart §8.1, JOURNAL 2026-10-08) : la pill Canvas repliée, où la photo déplie le profil ; en live, le rond
// violet de Twitch remplace le rouge. `isExpanded` dit si le bouton déplie ce qu'il commande.
type AvatarButtonProps = {
  user: AvatarProps;
  title: string;
  onPress: () => void;
  hasDot?: boolean;
  isLive?: boolean;
  isExpanded?: boolean;
};

export const AvatarButton = ({
  user,
  title,
  onPress,
  hasDot = false,
  isLive = false,
  isExpanded,
}: AvatarButtonProps) => (
  <button
    type="button"
    className="lp-btn lp-avatar-btn"
    title={title}
    aria-label={title}
    aria-expanded={isExpanded}
    onClick={blurAfterClick(onPress)}
  >
    <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
    {(hasDot || isLive) && (
      <span className={classNames("lp-avatar-dot", isLive && "lp-avatar-dot--live")} aria-hidden="true" />
    )}
  </button>
);

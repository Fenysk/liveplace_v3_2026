// La pill Compte (CDC 2026), en haut à droite : Développeur (lui seul), Réglages (le streamer sur son canvas) ou
// Modération (qui modère sans être le streamer), sa photo (Mon compte), Nouveautés (pour tous), puis l'apparence ;
// l'invité a Nouveautés, l'apparence, puis Se connecter. L'apparence passe à droite de la photo dès que le compte a un
// bouton de rôle ou Nouveautés (§9.9). La langue se choisit dans Mon compte, pas ici. Sur son canvas, c'est la seule
// pill du streamer. Sur mobile (§9.7), ni l'apparence (elle est dans Mon compte) ni Se connecter (la barre du bas le
// dit) : l'invité garde Nouveautés seul, et Se connecter sans barre du bas (une archive).

import { Activity, Settings, Shield, Sparkles } from "lucide-react";
import type { AppearanceChoice } from "../design/appearance";
import { AppearanceButton } from "../design/appearance-controls";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import { SignInButton } from "../design/twitch";
import { TimelapseButton } from "../developer/timelapse-button";
import { BubbleTarget } from "../help/bubble-target";
import { useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import { RELEASE_NOTES_TEXTS } from "../release-notes/release-notes-texts";
import { ACCOUNT_TEXTS } from "./account-texts";

const DOCK: PillDock = "tr";

// `unknown` : le gateway n'a pas encore répondu au `hello`. Le web affiche, le gateway décide (§10.3).
export type AccountIdentity =
  | { kind: "unknown" }
  | { kind: "guest" }
  | { kind: "signedIn"; user: ProfileUser };

export type AccountPillProps = {
  identity: AccountIdentity;
  signInHref: string;
  appearanceChoice: AppearanceChoice;
  onPickAppearance: (choice: AppearanceChoice) => void;
  onOpenAccount: () => void; // la fenêtre, ouverte sur Mon compte, ou sur Modération si des signalements attendent (sauf au modérateur)
  onOpenSettings?: (() => void) | undefined; // la fenêtre, sur Canvas ; absent : pas le streamer sur son canvas
  onOpenModeration?: (() => void) | undefined; // la fenêtre, sur Modération ; absent : pas modérateur sans être le streamer
  onOpenDeveloper?: (() => void) | undefined; // §10.3 : la fenêtre Développeur, pour lui seul
  onOpenTimelapse?: (() => void) | undefined; // le GIF de la fresque, pour lui seul, sur sa propre fresque (ailleurs : la pill Canvas)
  onOpenReleaseNotes?: (() => void) | undefined; // la fenêtre, sur Nouveautés ; pour tous, une fois le rôle connu
  hasUnreadReleaseNotes?: boolean; // un point sur Nouveautés, jamais sur la photo (elle porte celui des signalements)
  pendingReports?: number; // pour qui modère : un point tant qu'il y en a, sur Modération s'il l'a, sinon sur sa photo (JOURNAL 2026-09-28)
  onSignIn?: () => void; // la page part chez Twitch
  isCompact?: boolean;
  hasBottomBar?: boolean; // faux sans barre du bas (la page d'une archive) : l'invité y garde Se connecter sur mobile
  isDocked?: boolean;
  isVisible?: boolean; // masquée tant que le serveur a reconnu le streamer et que le gateway n'a pas répondu
};

type LayoutInput = Pick<
  AccountPillProps,
  "identity" | "onOpenDeveloper" | "onOpenSettings" | "onOpenModeration" | "onOpenReleaseNotes"
> & { isCompact: boolean; hasBottomBar: boolean };

// Ce que la pill montre, d'après qui regarde et ce qu'on lui donne à ouvrir.
// Sur mobile, Se connecter ne reste que sans barre du bas ; sans lui, sans photo ni Nouveautés, il ne reste rien : la pill
// s'efface et la pill Canvas prend la rangée (pill.css). Nouveautés manque tant que le gateway n'a pas répondu : le point dépend du rôle.
// Avec un bouton de rôle à gauche de la photo, ou Nouveautés à sa droite pour un compte connecté, l'apparence passe à droite de la photo (§9.9).
const layoutOf = ({ identity, isCompact, hasBottomBar, ...openers }: LayoutInput) => {
  const releaseNotes = identity.kind === "unknown" ? undefined : openers.onOpenReleaseNotes;
  const hasRoleButtons = Boolean(
    openers.onOpenDeveloper || openers.onOpenSettings || openers.onOpenModeration,
  );
  const showsSignIn = identity.kind === "guest" && (!isCompact || !hasBottomBar);
  return {
    releaseNotes,
    showsSignIn,
    isAppearanceAfterPhoto: hasRoleButtons || (identity.kind === "signedIn" && releaseNotes !== undefined),
    hasNothingToShow: isCompact && identity.kind !== "signedIn" && !showsSignIn && releaseNotes === undefined,
  };
};

// Le titre d'un bouton qui porte des signalements en attente : « Mon compte · 2 signalements en attente ».
const useTitleWithReports = (): ((title: string, reports: number) => string) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const moderation = useTexts(MODERATION_TEXTS);
  return (title, reports) => (reports > 0 ? t.withPending(title, moderation.reportCount(reports)) : title);
};

type RoleButtonsProps = Pick<
  AccountPillProps,
  "onOpenDeveloper" | "onOpenTimelapse" | "onOpenSettings" | "onOpenModeration"
> & {
  moderationReports: number;
};

// Développeur, Réglages ou Modération : les boutons de rôle, à gauche de la photo.
const RoleButtons = ({
  onOpenDeveloper,
  onOpenTimelapse,
  onOpenSettings,
  onOpenModeration,
  moderationReports,
}: RoleButtonsProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const titleWithReports = useTitleWithReports();
  return (
    <>
      {onOpenDeveloper && (
        <Button icon={Activity} variant="ghost" title="Développeur" onPress={onOpenDeveloper} />
      )}
      {onOpenTimelapse && <TimelapseButton onPress={onOpenTimelapse} />}
      {onOpenSettings && (
        <BubbleTarget name="settings">
          <Button icon={Settings} variant="ghost" title={t.settings} onPress={onOpenSettings} />
        </BubbleTarget>
      )}
      {onOpenModeration && (
        <BubbleTarget name="reports">
          <Button
            icon={Shield}
            variant="ghost"
            title={titleWithReports(t.moderation, moderationReports)}
            hasDot={moderationReports > 0}
            onPress={onOpenModeration}
          />
        </BubbleTarget>
      )}
    </>
  );
};

type ReleaseNotesButtonProps = { hasDot: boolean; onPress: () => void };

// Le point est à Nouveautés, jamais à la photo : elle porte déjà celui des signalements.
const ReleaseNotesButton = ({ hasDot, onPress }: ReleaseNotesButtonProps) => {
  const releaseNotes = useTexts(RELEASE_NOTES_TEXTS);
  return (
    <Button icon={Sparkles} variant="ghost" title={releaseNotes.title} hasDot={hasDot} onPress={onPress} />
  );
};

type AccountAvatarProps = {
  user: ProfileUser;
  reports: number;
  isReportsTarget: boolean;
  onPress: () => void;
};

// La photo, qui porte le point des signalements sans bouton Modération : la bulle d'aide des signalements la vise alors.
const AccountAvatar = ({ user, reports, isReportsTarget, onPress }: AccountAvatarProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const titleWithReports = useTitleWithReports();
  const avatar = (
    <AvatarButton
      user={user}
      title={titleWithReports(t.myAccount, reports)}
      hasDot={reports > 0}
      onPress={onPress}
    />
  );
  return isReportsTarget ? <BubbleTarget name="reports">{avatar}</BubbleTarget> : avatar;
};

export const AccountPill = ({
  identity,
  signInHref,
  appearanceChoice,
  onPickAppearance,
  onOpenAccount,
  onOpenSettings,
  onOpenModeration,
  onOpenDeveloper,
  onOpenTimelapse,
  onOpenReleaseNotes,
  hasUnreadReleaseNotes = false,
  pendingReports = 0,
  onSignIn,
  isCompact = false,
  hasBottomBar = true,
  isDocked = true,
  isVisible = true,
}: AccountPillProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const appearance = !isCompact && <AppearanceButton choice={appearanceChoice} onPick={onPickAppearance} />;
  const { releaseNotes, isAppearanceAfterPhoto, showsSignIn, hasNothingToShow } = layoutOf({
    identity,
    isCompact,
    hasBottomBar,
    onOpenDeveloper,
    onOpenSettings,
    onOpenModeration,
    onOpenReleaseNotes,
  });
  // Le point suit le bouton qui mène aux signalements : Modération pour le modérateur, sinon la photo (une seule pastille).
  // La bulle d'aide des signalements vise le même bouton (§9.11).
  const hasModeration = Boolean(onOpenModeration);
  const isSignedIn = identity.kind === "signedIn";
  // Nouveautés suit la photo d'un compte connecté ; l'invité l'a en premier.
  const releaseNotesButton = releaseNotes && (
    <ReleaseNotesButton hasDot={hasUnreadReleaseNotes} onPress={releaseNotes} />
  );
  return (
    <Pill dock={isDocked ? DOCK : undefined} isVisible={isVisible && !hasNothingToShow}>
      <RoleButtons
        onOpenDeveloper={onOpenDeveloper}
        onOpenTimelapse={onOpenTimelapse}
        onOpenSettings={onOpenSettings}
        onOpenModeration={onOpenModeration}
        moderationReports={hasModeration ? pendingReports : 0}
      />
      {!isSignedIn && releaseNotesButton}
      {!isAppearanceAfterPhoto && appearance}
      {showsSignIn && <SignInButton href={signInHref} label={t.signIn} onPress={onSignIn} />}
      {identity.kind === "signedIn" && (
        <AccountAvatar
          user={identity.user}
          reports={hasModeration ? 0 : pendingReports}
          isReportsTarget={!hasModeration}
          onPress={onOpenAccount}
        />
      )}
      {isSignedIn && releaseNotesButton}
      {isAppearanceAfterPhoto && appearance}
    </Pill>
  );
};

// La pill Compte (CDC 2026), en haut à droite : Développeur (lui seul), Réglages (le streamer sur son canvas) ou
// Modération (qui modère sans être le streamer), l'apparence, puis sa photo (Mon compte) ou Se connecter. Avec
// Développeur, Réglages ou Modération, l'apparence passe à droite de la photo (Écart §14, JOURNAL 2026-10-07). La langue
// se choisit dans Mon compte, pas ici. Sur son canvas, c'est la seule pill du streamer. Sur mobile (Écart §8.1,
// JOURNAL 2026-10-08), ni l'apparence (elle est dans Mon compte) ni Se connecter (la barre du bas le dit) : l'invité
// n'a plus de pill, sauf sans barre du bas (une archive).

import { Activity, Settings, Shield } from "lucide-react";
import type { AppearanceChoice } from "../design/appearance";
import { AppearanceButton } from "../design/appearance-controls";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import { SignInButton } from "../design/twitch";
import { BubbleTarget } from "../help/bubble-target";
import { useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
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
  onOpenDeveloper?: (() => void) | undefined; // écart §10.3 (JOURNAL 2026-10-06) : la fenêtre Développeur, pour lui seul
  pendingReports?: number; // pour qui modère : un point tant qu'il y en a, sur Modération s'il l'a, sinon sur sa photo (JOURNAL 2026-09-28)
  onSignIn?: () => void; // la page part chez Twitch
  isCompact?: boolean;
  hasBottomBar?: boolean; // faux sans barre du bas (la page d'une archive) : l'invité y garde Se connecter sur mobile
  isDocked?: boolean;
  isVisible?: boolean; // masquée tant que le serveur a reconnu le streamer et que le gateway n'a pas répondu
};

// Sur mobile, Se connecter ne reste que sans barre du bas ; sans lui ni photo, il ne reste rien : la pill s'efface et la pill
// Canvas prend la rangée (pill.css).
const visibilityOf = (identity: AccountIdentity, isCompact: boolean, hasBottomBar: boolean) => {
  const showsSignIn = identity.kind === "guest" && (!isCompact || !hasBottomBar);
  return { showsSignIn, hasNothingToShow: isCompact && identity.kind !== "signedIn" && !showsSignIn };
};

// Le titre d'un bouton qui porte des signalements en attente : « Mon compte · 2 signalements en attente ».
const useTitleWithReports = (): ((title: string, reports: number) => string) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const moderation = useTexts(MODERATION_TEXTS);
  return (title, reports) => (reports > 0 ? t.withPending(title, moderation.reportCount(reports)) : title);
};

type RoleButtonsProps = Pick<AccountPillProps, "onOpenDeveloper" | "onOpenSettings" | "onOpenModeration"> & {
  moderationReports: number;
};

// Développeur, Réglages ou Modération : les boutons de rôle, à gauche de la photo.
const RoleButtons = ({
  onOpenDeveloper,
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
  pendingReports = 0,
  onSignIn,
  isCompact = false,
  hasBottomBar = true,
  isDocked = true,
  isVisible = true,
}: AccountPillProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const appearance = !isCompact && <AppearanceButton choice={appearanceChoice} onPick={onPickAppearance} />;
  const hasLeftIcons = Boolean(onOpenDeveloper || onOpenSettings || onOpenModeration);
  // Le point suit le bouton qui mène aux signalements : Modération pour le modérateur, sinon la photo (une seule pastille).
  // La bulle d'aide des signalements vise le même bouton (Écart §8.1, JOURNAL 2026-10-08).
  const hasModeration = Boolean(onOpenModeration);
  const { showsSignIn, hasNothingToShow } = visibilityOf(identity, isCompact, hasBottomBar);
  return (
    <Pill dock={isDocked ? DOCK : undefined} isVisible={isVisible && !hasNothingToShow}>
      <RoleButtons
        onOpenDeveloper={onOpenDeveloper}
        onOpenSettings={onOpenSettings}
        onOpenModeration={onOpenModeration}
        moderationReports={hasModeration ? pendingReports : 0}
      />
      {!hasLeftIcons && appearance}
      {showsSignIn && <SignInButton href={signInHref} label={t.signIn} onPress={onSignIn} />}
      {identity.kind === "signedIn" && (
        <AccountAvatar
          user={identity.user}
          reports={hasModeration ? 0 : pendingReports}
          isReportsTarget={!hasModeration}
          onPress={onOpenAccount}
        />
      )}
      {hasLeftIcons && appearance}
    </Pill>
  );
};

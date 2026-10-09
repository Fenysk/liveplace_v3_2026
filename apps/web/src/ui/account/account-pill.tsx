// La pill Compte (CDC 2026), en haut à droite : Développeur (lui seul), Réglages (le streamer sur son canvas) ou
// Modération (qui modère sans être le streamer), l'apparence, puis sa photo (Mon compte) ou Se connecter. Avec
// Développeur, Réglages ou Modération, l'apparence passe à droite de la photo (Écart §14, JOURNAL 2026-10-07). La langue
// se choisit dans Mon compte, pas ici. Sur son canvas, c'est la seule pill du streamer.

import { Activity, Settings, Shield } from "lucide-react";
import type { AppearanceChoice } from "../design/appearance";
import { AppearanceButton } from "../design/appearance-controls";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import { SignInButton } from "../design/twitch";
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
  isDocked?: boolean;
  isVisible?: boolean; // masquée tant que le serveur a reconnu le streamer et que le gateway n'a pas répondu
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
  isDocked = true,
  isVisible = true,
}: AccountPillProps) => {
  const appearance = <AppearanceButton choice={appearanceChoice} onPick={onPickAppearance} />;
  const t = useTexts(ACCOUNT_TEXTS);
  const moderation = useTexts(MODERATION_TEXTS);
  const titleWithReports = (title: string, reports: number): string =>
    reports > 0 ? t.withPending(title, moderation.reportCount(reports)) : title;
  const hasLeftIcons = Boolean(onOpenDeveloper || onOpenSettings || onOpenModeration);
  // Le point suit le bouton qui mène aux signalements : Modération pour le modérateur, sinon la photo (une seule pastille).
  const moderationReports = onOpenModeration ? pendingReports : 0;
  const avatarReports = onOpenModeration ? 0 : pendingReports;
  return (
    <Pill dock={isDocked ? DOCK : undefined} isVisible={isVisible}>
      {onOpenDeveloper && (
        <Button icon={Activity} variant="ghost" title="Développeur" onPress={onOpenDeveloper} />
      )}
      {onOpenSettings && (
        <Button icon={Settings} variant="ghost" title={t.settings} onPress={onOpenSettings} />
      )}
      {onOpenModeration && (
        <Button
          icon={Shield}
          variant="ghost"
          title={titleWithReports(t.moderation, moderationReports)}
          hasDot={moderationReports > 0}
          onPress={onOpenModeration}
        />
      )}
      {!hasLeftIcons && appearance}
      {identity.kind === "guest" &&
        // Sur mobile, l'icône seule : la place manque en haut de l'écran.
        (isCompact ? (
          <SignInButton href={signInHref} onPress={onSignIn} />
        ) : (
          <SignInButton href={signInHref} label={t.signIn} onPress={onSignIn} />
        ))}
      {identity.kind === "signedIn" && (
        <AvatarButton
          user={identity.user}
          title={titleWithReports(t.myAccount, avatarReports)}
          hasDot={avatarReports > 0}
          onPress={onOpenAccount}
        />
      )}
      {hasLeftIcons && appearance}
    </Pill>
  );
};

// La pill Compte (CDC 2026), en haut à droite : Développeur (lui seul), Réglages (le streamer sur son canvas) ou
// Modération (qui modère sans être le streamer), le thème, puis sa photo (Mon compte) ou Se connecter.
// Sur son canvas, c'est la seule pill du streamer.

import { Activity, Settings, Shield } from "lucide-react";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemeButton } from "../design/theme-controls";
import { SignInButton } from "../design/twitch";
import { reportCountLabel } from "../moderation/moderation-texts";

const DOCK: PillDock = "tr";

// `unknown` : le gateway n'a pas encore répondu au `hello`. Le web affiche, le gateway décide (§10.3).
export type AccountIdentity =
  | { kind: "unknown" }
  | { kind: "guest" }
  | { kind: "signedIn"; user: ProfileUser };

export type AccountPillProps = {
  identity: AccountIdentity;
  signInHref: string;
  themeChoice: ThemeChoice;
  onPickTheme: (choice: ThemeChoice) => void;
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

const titleWithReports = (title: string, reports: number): string =>
  reports > 0 ? `${title} · ${reportCountLabel(reports)} en attente` : title;

export const AccountPill = ({
  identity,
  signInHref,
  themeChoice,
  onPickTheme,
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
  // Le point suit le bouton qui mène aux signalements : Modération pour le modérateur, sinon la photo (une seule pastille).
  const moderationReports = onOpenModeration ? pendingReports : 0;
  const avatarReports = onOpenModeration ? 0 : pendingReports;
  return (
    <Pill dock={isDocked ? DOCK : undefined} isVisible={isVisible}>
      {onOpenDeveloper && (
        <Button icon={Activity} variant="ghost" title="Développeur" onPress={onOpenDeveloper} />
      )}
      {onOpenSettings && <Button icon={Settings} variant="ghost" title="Réglages" onPress={onOpenSettings} />}
      {onOpenModeration && (
        <Button
          icon={Shield}
          variant="ghost"
          title={titleWithReports("Modération", moderationReports)}
          hasDot={moderationReports > 0}
          onPress={onOpenModeration}
        />
      )}
      <ThemeButton choice={themeChoice} onPick={onPickTheme} />
      {identity.kind === "guest" &&
        // Sur mobile, l'icône seule : la place manque en haut de l'écran.
        (isCompact ? (
          <SignInButton href={signInHref} onPress={onSignIn} />
        ) : (
          <SignInButton href={signInHref} label="Se connecter" onPress={onSignIn} />
        ))}
      {identity.kind === "signedIn" && (
        <AvatarButton
          user={identity.user}
          title={titleWithReports("Mon compte", avatarReports)}
          hasDot={avatarReports > 0}
          onPress={onOpenAccount}
        />
      )}
    </Pill>
  );
};

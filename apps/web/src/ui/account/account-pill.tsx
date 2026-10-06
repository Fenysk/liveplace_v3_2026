// La pill Compte (CDC 2026), en haut à droite : Développeur (lui seul), Réglages (le streamer sur son canvas), le thème,
// puis sa photo (Mon compte) ou Se connecter. Sur son canvas, c'est la seule pill du streamer.

import { Activity, Settings } from "lucide-react";
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
  onOpenAccount: () => void; // la fenêtre, ouverte sur Mon compte, ou sur Modération si des signalements attendent
  onOpenSettings?: (() => void) | undefined; // la fenêtre, sur Canvas ; absent : pas le streamer sur son canvas
  onOpenDeveloper?: (() => void) | undefined; // écart §10.3 (JOURNAL 2026-10-06) : la fenêtre Développeur, pour lui seul
  pendingReports?: number; // pour qui modère : un point sur sa photo tant qu'il y en a (JOURNAL 2026-09-28)
  onSignIn?: () => void; // la page part chez Twitch
  isCompact?: boolean;
  isDocked?: boolean;
  isVisible?: boolean; // masquée tant que le serveur a reconnu le streamer et que le gateway n'a pas répondu
};

export const AccountPill = ({
  identity,
  signInHref,
  themeChoice,
  onPickTheme,
  onOpenAccount,
  onOpenSettings,
  onOpenDeveloper,
  pendingReports = 0,
  onSignIn,
  isCompact = false,
  isDocked = true,
  isVisible = true,
}: AccountPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined} isVisible={isVisible}>
    {onOpenDeveloper && (
      <Button icon={Activity} variant="ghost" title="Développeur" onPress={onOpenDeveloper} />
    )}
    {onOpenSettings && <Button icon={Settings} variant="ghost" title="Réglages" onPress={onOpenSettings} />}
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
        title={
          pendingReports > 0 ? `Mon compte · ${reportCountLabel(pendingReports)} en attente` : "Mon compte"
        }
        hasDot={pendingReports > 0}
        onPress={onOpenAccount}
      />
    )}
  </Pill>
);

// La pill Compte (CDC 2026), en haut à droite : le thème, puis sa photo (Mon compte) ou Se connecter.

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
  pendingReports?: number; // pour qui modère : un point sur sa photo tant qu'il y en a (JOURNAL 2026-09-28)
  onSignIn?: () => void; // la page part chez Twitch
  isCompact?: boolean;
  isDocked?: boolean;
};

export const AccountPill = ({
  identity,
  signInHref,
  themeChoice,
  onPickTheme,
  onOpenAccount,
  pendingReports = 0,
  onSignIn,
  isCompact = false,
  isDocked = true,
}: AccountPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined}>
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

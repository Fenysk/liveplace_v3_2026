// La pill Compte (CDC 2026), en haut à droite : le thème, puis sa photo (Mon compte) ou Se connecter.

import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemeButton } from "../design/theme-controls";
import { SignInButton } from "../design/twitch";

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
  onOpenAccount: () => void; // la fenêtre, ouverte sur Mon compte
  isCompact?: boolean;
  isDocked?: boolean;
};

export const AccountPill = ({
  identity,
  signInHref,
  themeChoice,
  onPickTheme,
  onOpenAccount,
  isCompact = false,
  isDocked = true,
}: AccountPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined}>
    <ThemeButton choice={themeChoice} onPick={onPickTheme} />
    {identity.kind === "guest" &&
      // Sur mobile, l'icône seule : la place manque en haut de l'écran.
      (isCompact ? (
        <SignInButton href={signInHref} />
      ) : (
        <SignInButton href={signInHref} label="Se connecter" />
      ))}
    {identity.kind === "signedIn" && (
      <AvatarButton user={identity.user} title="Mon compte" onPress={onOpenAccount} />
    )}
  </Pill>
);

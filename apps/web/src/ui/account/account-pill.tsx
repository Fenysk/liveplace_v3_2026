// La pill Compte (CDC 2026), en haut à droite : le thème, puis sa photo (Mon compte) ou Se connecter.

import { useState } from "react";
import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemeButton } from "../design/theme-controls";
import { SignInButton } from "../design/twitch";
import { type AccountSection, AccountWindow } from "./account-window";

const DOCK: PillDock = "tr";

// `unknown` : le gateway n'a pas encore répondu au `hello`. Le web affiche, le gateway décide (§10.3).
export type AccountIdentity =
  | { kind: "unknown" }
  | { kind: "guest" }
  | { kind: "signedIn"; user: ProfileUser };

export type AccountPillProps = {
  identity: AccountIdentity;
  signInHref: string;
  signOutHref: string;
  themeChoice: ThemeChoice;
  onPickTheme: (choice: ThemeChoice) => void;
  isCompact?: boolean;
  isDocked?: boolean;
};

export const AccountPill = ({
  identity,
  signInHref,
  signOutHref,
  themeChoice,
  onPickTheme,
  isCompact = false,
  isDocked = true,
}: AccountPillProps) => {
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [sectionId, setSectionId] = useState<AccountSection>("account");
  const openAccount = () => {
    setSectionId("account");
    setIsWindowOpen(true);
  };
  return (
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
        <>
          <AvatarButton user={identity.user} title="Mon compte" onPress={openAccount} />
          <AccountWindow
            isOpen={isWindowOpen}
            sectionId={sectionId}
            onSelect={setSectionId}
            onClose={() => setIsWindowOpen(false)}
            user={identity.user}
            signOutHref={signOutHref}
            themeChoice={themeChoice}
            onPickTheme={onPickTheme}
          />
        </>
      )}
    </Pill>
  );
};

// La fenêtre ouverte par la pill Compte (CDC 2026, Fenêtre) : Mon compte et Préférences.
// Les sections Canvas, Vue OBS et Modération arrivent avec leur fonctionnalité.

import { LogOut, Settings, User } from "lucide-react";
import { Button } from "../design/button";
import { Profile, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemePicker } from "../design/theme-controls";
import { Window, WindowRow } from "../design/window";

export type AccountSection = "account" | "preferences";

const SECTIONS = [
  { id: "account", label: "Mon compte", icon: User },
  { id: "preferences", label: "Préférences", icon: Settings },
] as const;

type AccountWindowProps = {
  isOpen: boolean;
  sectionId: AccountSection;
  onSelect: (sectionId: AccountSection) => void;
  onClose: () => void;
  user: ProfileUser;
  signOutHref: string;
  themeChoice: ThemeChoice;
  onPickTheme: (choice: ThemeChoice) => void;
};

export const AccountWindow = ({
  isOpen,
  sectionId,
  onSelect,
  onClose,
  user,
  signOutHref,
  themeChoice,
  onPickTheme,
}: AccountWindowProps) => (
  <Window isOpen={isOpen} sections={SECTIONS} sectionId={sectionId} onSelect={onSelect} onClose={onClose}>
    {sectionId === "account" ? (
      <WindowRow label={<Profile user={user} variant="full" />}>
        <Button label="Se déconnecter" icon={LogOut} href={signOutHref} />
      </WindowRow>
    ) : (
      <WindowRow label="Thème">
        <ThemePicker choice={themeChoice} onPick={onPickTheme} />
      </WindowRow>
    )}
  </Window>
);

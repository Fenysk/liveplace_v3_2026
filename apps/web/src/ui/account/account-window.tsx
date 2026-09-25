// La fenêtre ouverte par la pill Compte (CDC 2026, Fenêtre) : Modération pour qui modère, Mon compte et Préférences.
// Les sections Canvas et Vue OBS arrivent avec leur fonctionnalité.

import { LogOut, Settings, Shield, User } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";
import { Profile, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemePicker } from "../design/theme-controls";
import { Window, WindowRow } from "../design/window";

export type AccountSection = "moderation" | "account" | "preferences";

// Dans l'ordre du CDC 2026 : Modération avant Mon compte.
const MODERATION_SECTION = { id: "moderation", label: "Modération", icon: Shield } as const;
const SECTIONS = [
  { id: "account", label: "Mon compte", icon: User },
  { id: "preferences", label: "Préférences", icon: Settings },
] as const;
const MODERATING_SECTIONS = [MODERATION_SECTION, ...SECTIONS];

type AccountWindowProps = {
  isOpen: boolean;
  sectionId: AccountSection;
  onSelect: (sectionId: AccountSection) => void;
  onClose: () => void;
  user: ProfileUser;
  signOutHref: string;
  themeChoice: ThemeChoice;
  onPickTheme: (choice: ThemeChoice) => void;
  moderationTab?: ReactNode | undefined; // absent : pas le droit de modérer (JOURNAL 2026-09-25)
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
  moderationTab,
}: AccountWindowProps) => (
  <Window
    isOpen={isOpen}
    sections={moderationTab ? MODERATING_SECTIONS : SECTIONS}
    sectionId={sectionId}
    onSelect={onSelect}
    onClose={onClose}
  >
    {sectionId === "moderation" && moderationTab}
    {sectionId === "account" && (
      <WindowRow label={<Profile user={user} variant="full" />}>
        <Button label="Se déconnecter" icon={LogOut} href={signOutHref} />
      </WindowRow>
    )}
    {sectionId === "preferences" && (
      <WindowRow label="Thème">
        <ThemePicker choice={themeChoice} onPick={onPickTheme} />
      </WindowRow>
    )}
  </Window>
);

// La fenêtre (CDC 2026, Fenêtre), ouverte par la pill Compte (Mon compte) ou la pill Canvas (Vue OBS) : Vue OBS pour le
// streamer, Modération pour qui modère, Mon compte et Préférences. La section Canvas attend le bloc 2.

import { LogOut, MonitorPlay, Settings, Shield, User } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";
import { Profile, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemePicker } from "../design/theme-controls";
import { Window, WindowRow } from "../design/window";

export type AccountSection = "obs" | "moderation" | "account" | "preferences";

// Dans l'ordre du CDC 2026 : Vue OBS, Modération, Mon compte, Préférences.
const OBS_SECTION = { id: "obs", label: "Vue OBS", icon: MonitorPlay } as const;
const MODERATION_SECTION = { id: "moderation", label: "Modération", icon: Shield } as const;
const ACCOUNT_SECTIONS = [
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
  moderationTab?: ReactNode | undefined; // absent : pas le droit de modérer (JOURNAL 2026-09-25)
  obsTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (JOURNAL 2026-09-25)
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
  obsTab,
}: AccountWindowProps) => (
  <Window
    isOpen={isOpen}
    sections={[
      ...(obsTab ? [OBS_SECTION] : []),
      ...(moderationTab ? [MODERATION_SECTION] : []),
      ...ACCOUNT_SECTIONS,
    ]}
    sectionId={sectionId}
    onSelect={onSelect}
    onClose={onClose}
  >
    {sectionId === "obs" && obsTab}
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

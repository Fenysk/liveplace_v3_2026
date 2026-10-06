// La fenêtre (CDC 2026, Fenêtre), ouverte par la pill Compte (Mon compte, ou Canvas par Réglages) : Canvas et Vue
// OBS pour le streamer, Modération pour qui modère, Mon compte pour tous : son profil, le thème, Se déconnecter.

import { LogOut, MonitorPlay, Scaling, Shield, User } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";
import { Profile, type ProfileUser } from "../design/profile";
import type { ThemeChoice } from "../design/theme";
import { ThemePicker } from "../design/theme-controls";
import { Window, WindowRow } from "../design/window";

export type AccountSection = "canvas" | "obs" | "moderation" | "account";

// La section que Réglages ouvre : la taille et les jauges du canvas.
export const SETTINGS_SECTION = "canvas" as const satisfies AccountSection;

// Dans l'ordre du CDC 2026 : Canvas, Vue OBS, Modération, Mon compte.
const CANVAS_SECTION = { id: "canvas", label: "Canvas", icon: Scaling } as const;
const OBS_SECTION = { id: "obs", label: "Vue OBS", icon: MonitorPlay } as const;
const MODERATION_SECTION = { id: "moderation", label: "Modération", icon: Shield } as const;
const ACCOUNT_SECTION = { id: "account", label: "Mon compte", icon: User } as const;

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
  canvasTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (JOURNAL 2026-09-29)
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
  canvasTab,
}: AccountWindowProps) => (
  <Window
    isOpen={isOpen}
    sections={[
      ...(canvasTab ? [CANVAS_SECTION] : []),
      ...(obsTab ? [OBS_SECTION] : []),
      ...(moderationTab ? [MODERATION_SECTION] : []),
      ACCOUNT_SECTION,
    ]}
    sectionId={sectionId}
    onSelect={onSelect}
    onClose={onClose}
  >
    {sectionId === "canvas" && canvasTab}
    {sectionId === "obs" && obsTab}
    {sectionId === "moderation" && moderationTab}
    {sectionId === "account" && (
      <>
        <WindowRow label={<Profile user={user} variant="full" />}>
          <Button label="Se déconnecter" icon={LogOut} href={signOutHref} />
        </WindowRow>
        <WindowRow label="Thème">
          <ThemePicker choice={themeChoice} onPick={onPickTheme} />
        </WindowRow>
      </>
    )}
  </Window>
);

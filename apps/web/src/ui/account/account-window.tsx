// La fenêtre (CDC 2026, Fenêtre), ouverte par la pill Compte (Mon compte, ou Canvas par Réglages) : Canvas et Vue
// OBS pour le streamer, Modération pour qui modère, Classement sur mobile, Mon compte pour tous : son profil, l'apparence,
// la langue, Se déconnecter.

import { Layers, LogOut, type LucideIcon, MonitorPlay, Scaling, Shield, Trophy, User } from "lucide-react";
import type { ReactNode } from "react";
import type { AppearanceChoice } from "../design/appearance";
import { AppearancePicker } from "../design/appearance-controls";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LocalePicker } from "../design/locale-controls";
import { Profile, type ProfileUser } from "../design/profile";
import { Window, WindowRow } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { ACCOUNT_TEXTS } from "./account-texts";

export type AccountSection = "canvas" | "canvases" | "obs" | "moderation" | "scoreboard" | "account";

// La section que Réglages ouvre : la taille et les jauges du canvas.
export const SETTINGS_SECTION = "canvas" as const satisfies AccountSection;

// Dans l'ordre du CDC 2026 : Canvas, Vue OBS, Modération, Mon compte ; Archives à côté de Canvas (Écart §15,
// JOURNAL 2026-10-06). Le Classement du mobile se met avant Mon compte.
const SECTION_ICONS = {
  canvas: Scaling,
  canvases: Layers,
  obs: MonitorPlay,
  moderation: Shield,
  scoreboard: Trophy,
  account: User,
} as const satisfies Record<AccountSection, LucideIcon>;

type AccountWindowProps = {
  isOpen: boolean;
  sectionId: AccountSection;
  onSelect: (sectionId: AccountSection) => void;
  onClose: () => void;
  user: ProfileUser;
  signOutHref: string;
  appearanceChoice: AppearanceChoice;
  onPickAppearance: (choice: AppearanceChoice) => void;
  moderationTab?: ReactNode | undefined; // absent : pas le droit de modérer (JOURNAL 2026-09-25)
  obsTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (JOURNAL 2026-09-25)
  canvasTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (JOURNAL 2026-09-29)
  canvasesTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (Écart §15, JOURNAL 2026-10-06)
  scoreboardTab?: ReactNode | undefined; // absent : sur PC, le classement est une colonne (JOURNAL 2026-10-06)
};

export const AccountWindow = ({
  isOpen,
  sectionId,
  onSelect,
  onClose,
  user,
  signOutHref,
  appearanceChoice,
  onPickAppearance,
  moderationTab,
  obsTab,
  canvasTab,
  canvasesTab,
  scoreboardTab,
}: AccountWindowProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const section = (id: AccountSection, label: string) => ({ id, label, icon: SECTION_ICONS[id] });
  const sections = [
    ...(canvasTab ? [section("canvas", t.canvas)] : []),
    ...(canvasesTab ? [section("canvases", t.archives)] : []),
    ...(obsTab ? [section("obs", t.obsView)] : []),
    ...(moderationTab ? [section("moderation", t.moderation)] : []),
    ...(scoreboardTab ? [section("scoreboard", t.scoreboard)] : []),
    section("account", t.myAccount),
  ];
  // Une section qui n'existe plus (le classement, en passant du mobile au PC) : la fenêtre montre la première.
  const shownId = sections.find(({ id }) => id === sectionId)?.id ?? sections[0]?.id;
  return (
    <Window isOpen={isOpen} sections={sections} sectionId={sectionId} onSelect={onSelect} onClose={onClose}>
      {shownId === "canvas" && canvasTab}
      {shownId === "canvases" && canvasesTab}
      {shownId === "obs" && obsTab}
      {shownId === "moderation" && moderationTab}
      {shownId === "scoreboard" && scoreboardTab}
      {shownId === "account" && (
        <>
          <WindowRow label={<Profile user={user} variant="full" />}>
            <Button label={t.signOut} icon={LogOut} href={signOutHref} />
          </WindowRow>
          <WindowRow label={design.appearance}>
            <AppearancePicker choice={appearanceChoice} onPick={onPickAppearance} />
          </WindowRow>
          <WindowRow label={design.language}>
            <LocalePicker />
          </WindowRow>
        </>
      )}
    </Window>
  );
};

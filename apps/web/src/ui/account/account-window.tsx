// La fenêtre (CDC 2026, Fenêtre), ouverte par la pill Compte (Mon compte, Nouveautés, ou Canvas par Réglages) : Canvas et Vue
// OBS pour le streamer, Modération pour qui modère, Classement sur mobile, Mon compte pour qui est connecté : son profil,
// l'apparence, la langue, Se déconnecter, et en bas, sous un filet, Supprimer mon compte (CDC §8). Nouveautés est la dernière
// section, pour tous : un invité n'a que elle (et le Classement sur mobile).

import {
  Layers,
  LogOut,
  type LucideIcon,
  MonitorPlay,
  RotateCcw,
  Scaling,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AppearanceChoice } from "../design/appearance";
import { AppearancePicker } from "../design/appearance-controls";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LocalePicker } from "../design/locale-controls";
import { Profile, type ProfileUser } from "../design/profile";
import { useToast } from "../design/toast";
import { Window, WindowRow } from "../design/window";
import { BubbleTarget, type BubbleTargetName } from "../help/bubble-target";
import { useTexts } from "../locale/use-locale";
import { RELEASE_NOTES_TEXTS } from "../release-notes/release-notes-texts";
import { ACCOUNT_TEXTS } from "./account-texts";
import { DELETE_ACCOUNT_TEXTS } from "./delete-account-texts";

export type AccountSection =
  | "canvas"
  | "canvases"
  | "obs"
  | "moderation"
  | "scoreboard"
  | "account"
  | "releaseNotes";

// La section que Réglages ouvre : la taille et les jauges du canvas.
export const SETTINGS_SECTION = "canvas" as const satisfies AccountSection;

// Dans l'ordre du CDC 2026 : Canvas, Vue OBS, Modération, Mon compte ; Archives à côté de Canvas (§17.1).
// Le Classement du mobile se met avant Mon compte, Nouveautés après.
const SECTION_ICONS = {
  canvas: Scaling,
  canvases: Layers,
  obs: MonitorPlay,
  moderation: Shield,
  scoreboard: Trophy,
  account: User,
  releaseNotes: Sparkles,
} as const satisfies Record<AccountSection, LucideIcon>;

// §9.11 : les onglets Vue OBS et Modération sont la cible des bulles qui invitent le streamer à
// les ouvrir.
const TAB_TARGETS: Partial<Record<string, BubbleTargetName>> = {
  obs: "obs-tab",
  moderation: "moderation-tab",
};

export const wrapBubbleTab = (id: string, tab: ReactNode): ReactNode => {
  const name = TAB_TARGETS[id];
  return name ? <BubbleTarget name={name}>{tab}</BubbleTarget> : tab;
};

type AccountWindowProps = {
  isOpen: boolean;
  sectionId: AccountSection;
  onSelect: (sectionId: AccountSection) => void;
  onClose: () => void;
  user?: ProfileUser | undefined; // absent : un invité, sans Mon compte
  signOutHref: string;
  appearanceChoice: AppearanceChoice;
  onPickAppearance: (choice: AppearanceChoice) => void;
  onRestartTutorial: () => void; // « Revoir le tuto » : le tutoriel repart de zéro sur cet appareil (§9.11)
  onDeleteAccount: () => void; // « Supprimer mon compte » : ouvre la confirmation (CDC §8), que la page porte
  moderationTab?: ReactNode | undefined; // absent : pas le droit de modérer (JOURNAL 2026-09-25)
  obsTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (JOURNAL 2026-09-25)
  canvasTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (JOURNAL 2026-09-29)
  canvasesTab?: ReactNode | undefined; // absent : ce n'est pas le streamer (§17.1)
  scoreboardTab?: ReactNode | undefined; // absent : sur PC, le classement est une colonne (JOURNAL 2026-10-06)
  releaseNotesTab?: ReactNode | undefined; // les Nouveautés des publics du rôle ; absent : pas de section
};

// Mon compte : son profil, l'apparence, la langue, le tutoriel, Supprimer mon compte. Un invité n'a pas de compte, donc pas
// cette section.
type MyAccountProps = Pick<
  AccountWindowProps,
  "signOutHref" | "appearanceChoice" | "onPickAppearance" | "onRestartTutorial" | "onDeleteAccount"
> & { user: ProfileUser };

const MyAccount = ({
  user,
  signOutHref,
  appearanceChoice,
  onPickAppearance,
  onRestartTutorial,
  onDeleteAccount,
}: MyAccountProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const deletion = useTexts(DELETE_ACCOUNT_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const toast = useToast();
  return (
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
      <WindowRow label={t.tutorial}>
        <Button
          label={t.tutorialRestart}
          icon={RotateCcw}
          onPress={() => {
            onRestartTutorial();
            toast("success", t.tutorialRestarted);
          }}
        />
      </WindowRow>
      <WindowRow label={<span className="lp-muted">{deletion.rowHint}</span>} isRuled>
        <Button label={deletion.deleteAccount} icon={Trash2} variant="danger" onPress={onDeleteAccount} />
      </WindowRow>
    </>
  );
};

// L'ordre des sections de la fenêtre : celles dont le contenu est donné, et Nouveautés après Mon compte.
const SECTION_ORDER = [
  "canvas",
  "canvases",
  "obs",
  "moderation",
  "scoreboard",
  "account",
  "releaseNotes",
] as const satisfies readonly AccountSection[];

export const AccountWindow = ({
  isOpen,
  sectionId,
  onSelect,
  onClose,
  user,
  signOutHref,
  appearanceChoice,
  onPickAppearance,
  onRestartTutorial,
  onDeleteAccount,
  moderationTab,
  obsTab,
  canvasTab,
  canvasesTab,
  scoreboardTab,
  releaseNotesTab,
}: AccountWindowProps) => {
  const t = useTexts(ACCOUNT_TEXTS);
  const releaseNotes = useTexts(RELEASE_NOTES_TEXTS);
  const labels: Record<AccountSection, string> = {
    canvas: t.canvas,
    canvases: t.archives,
    obs: t.obsView,
    moderation: t.moderation,
    scoreboard: t.scoreboard,
    account: t.myAccount,
    releaseNotes: releaseNotes.title,
  };
  const contents: Record<AccountSection, ReactNode> = {
    canvas: canvasTab,
    canvases: canvasesTab,
    obs: obsTab,
    moderation: moderationTab,
    scoreboard: scoreboardTab,
    account: user && (
      <MyAccount
        user={user}
        signOutHref={signOutHref}
        appearanceChoice={appearanceChoice}
        onPickAppearance={onPickAppearance}
        onRestartTutorial={onRestartTutorial}
        onDeleteAccount={onDeleteAccount}
      />
    ),
    releaseNotes: releaseNotesTab,
  };
  const sections = SECTION_ORDER.filter((id) => contents[id]).map((id) => ({
    id,
    label: labels[id],
    icon: SECTION_ICONS[id],
  }));
  // Une section qui n'existe plus (le classement, en passant du mobile au PC) : la fenêtre montre la première.
  const shownId = sections.find(({ id }) => id === sectionId)?.id ?? sections[0]?.id;
  return (
    <Window
      isOpen={isOpen}
      sections={sections}
      sectionId={sectionId}
      onSelect={onSelect}
      onClose={onClose}
      wrapTab={wrapBubbleTab}
    >
      {shownId && contents[shownId]}
    </Window>
  );
};

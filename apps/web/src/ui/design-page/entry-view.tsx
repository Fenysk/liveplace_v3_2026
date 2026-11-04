// Le rendu de chaque entrée du sommaire, branché par son slug : le type oblige à n'en oublier aucune.

import type { ComponentType } from "react";
import { AccountWindowEntry, DeleteAccountWindowEntry } from "./account-entries";
import {
  ArchiveBannerEntry,
  ArchivesEntry,
  DiscardWindowEntry,
  DownloadWindowEntry,
  SwitchWindowEntry,
} from "./archive-entries";
import { BubbleEntry } from "./bubble-entries";
import {
  CanvasSettingsEntry,
  CeilingWindowEntry,
  ObsSettingsEntry,
  ResizeWindowEntry,
} from "./canvas-window-entries";
import {
  ActivityCardEntry,
  BadgeEntry,
  ButtonEntry,
  ChipEntry,
  ChoicesEntry,
  FieldsEntry,
  PixelPreviewEntry,
  ProfileEntry,
  StatTilesEntry,
  TimeChartsEntry,
  UserBadgeEntry,
} from "./component-entries";
import type { EntrySlug } from "./design-entries";
import { DeveloperEntry } from "./developer-entries";
import {
  CanvasPaletteEntry,
  ColorTokensEntry,
  IconsEntry,
  MeasuresEntry,
  MotionEntry,
  TypographyEntry,
} from "./foundations-entries";
import {
  AccountPillEntry,
  CanvasPillEntry,
  DraftPillEntry,
  NoticeEntry,
  SupportPillEntry,
  SupportWindowEntry,
  ThemePillEntry,
  ViewportPillEntry,
} from "./game-entries";
import { GaugeEntry } from "./gauge-entry";
import { HomeEntry } from "./home-entries";
import { PaletteEntry, PillEntry, SignInEntry, ToastEntry, WindowEntry } from "./interactive-entries";
import {
  BannedWindowEntry,
  InspectionEntry,
  ModerationEntry,
  ModerationWindowEntry,
} from "./moderation-entries";
import { ReleaseNotesEntry } from "./release-notes-entries";
import { ScoreboardListEntry, ScoreboardPillEntry } from "./scoreboard-entries";
import { SkeletonEntry } from "./skeleton-entries";

const ENTRY_VIEWS: Record<EntrySlug, ComponentType> = {
  couleurs: ColorTokensEntry,
  "palette-du-canvas": CanvasPaletteEntry,
  typographie: TypographyEntry,
  mesures: MeasuresEntry,
  mouvement: MotionEntry,
  icones: IconsEntry,

  "apercu-de-pixels": PixelPreviewEntry,
  "avatar-et-profil": ProfileEntry,
  badge: BadgeEntry,
  "badge-du-pseudo": UserBadgeEntry,
  bouton: ButtonEntry,
  bulle: BubbleEntry,
  "carte-d-activite": ActivityCardEntry,
  champs: FieldsEntry,
  chiffres: StatTilesEntry,
  choix: ChoicesEntry,
  courbes: TimeChartsEntry,
  fenetre: WindowEntry,
  jauge: GaugeEntry,
  palette: PaletteEntry,
  pastille: ChipEntry,
  pill: PillEntry,
  "se-connecter": SignInEntry,
  squelette: SkeletonEntry,
  toast: ToastEntry,

  "pill-canvas": CanvasPillEntry,
  "bandeau-d-archive": ArchiveBannerEntry,
  "pill-theme": ThemePillEntry,
  "pill-compte": AccountPillEntry,
  "pill-classement": ScoreboardPillEntry,
  inspection: InspectionEntry,
  dessin: DraftPillEntry,
  pratique: ViewportPillEntry,
  "pill-soutenir": SupportPillEntry,
  "message-seul": NoticeEntry,

  "fenetre-canvas": CanvasSettingsEntry,
  archives: ArchivesEntry,
  "vue-obs": ObsSettingsEntry,
  moderation: ModerationEntry,
  "fenetre-classement": ScoreboardListEntry,
  "mon-compte": AccountWindowEntry,
  nouveautes: ReleaseNotesEntry,
  developpeur: DeveloperEntry,

  "taille-du-canvas": ResizeWindowEntry,
  "jauge-maximale": CeilingWindowEntry,
  "retirer-bannir-signaler": ModerationWindowEntry,
  banni: BannedWindowEntry,
  "archiver-ou-rouvrir": SwitchWindowEntry,
  "supprimer-une-archive": DiscardWindowEntry,
  "supprimer-son-compte": DeleteAccountWindowEntry,
  "telecharger-en-png": DownloadWindowEntry,
  "soutenir-liveplace": SupportWindowEntry,

  accueil: HomeEntry,
};

export const EntryView = ({ slug }: { slug: EntrySlug }) => {
  const View = ENTRY_VIEWS[slug];
  return <View />;
};

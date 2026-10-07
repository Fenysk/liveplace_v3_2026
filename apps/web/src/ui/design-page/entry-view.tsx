// Le rendu de chaque entrée du sommaire, branché par son slug : le type oblige à n'en oublier aucune.

import type { ComponentType } from "react";
import {
  ArchiveBannerEntry,
  ArchivesEntry,
  DiscardWindowEntry,
  DownloadWindowEntry,
  SwitchWindowEntry,
} from "./archive-entries";
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
  ChoicesEntry,
  FieldsEntry,
  PixelPreviewEntry,
  ProfileEntry,
  StatTilesEntry,
  TimeChartsEntry,
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
  ViewportPillEntry,
} from "./game-entries";
import { GaugeEntry } from "./gauge-entry";
import {
  AccountWindowEntry,
  PaletteEntry,
  PillEntry,
  SignInEntry,
  ToastEntry,
  WindowEntry,
} from "./interactive-entries";
import {
  BannedWindowEntry,
  InspectionEntry,
  ModerationEntry,
  ModerationWindowEntry,
} from "./moderation-entries";
import { ScoreboardListEntry, ScoreboardPillEntry } from "./scoreboard-entries";

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
  bouton: ButtonEntry,
  "carte-d-activite": ActivityCardEntry,
  champs: FieldsEntry,
  chiffres: StatTilesEntry,
  choix: ChoicesEntry,
  courbes: TimeChartsEntry,
  fenetre: WindowEntry,
  jauge: GaugeEntry,
  palette: PaletteEntry,
  pill: PillEntry,
  "se-connecter": SignInEntry,
  toast: ToastEntry,

  "pill-canvas": CanvasPillEntry,
  "bandeau-d-archive": ArchiveBannerEntry,
  "pill-compte": AccountPillEntry,
  "pill-classement": ScoreboardPillEntry,
  inspection: InspectionEntry,
  dessin: DraftPillEntry,
  pratique: ViewportPillEntry,
  "message-seul": NoticeEntry,

  "fenetre-canvas": CanvasSettingsEntry,
  archives: ArchivesEntry,
  "vue-obs": ObsSettingsEntry,
  moderation: ModerationEntry,
  "fenetre-classement": ScoreboardListEntry,
  "mon-compte": AccountWindowEntry,
  developpeur: DeveloperEntry,

  "taille-du-canvas": ResizeWindowEntry,
  "jauge-maximale": CeilingWindowEntry,
  "retirer-bannir-signaler": ModerationWindowEntry,
  banni: BannedWindowEntry,
  "archiver-ou-rouvrir": SwitchWindowEntry,
  "supprimer-une-archive": DiscardWindowEntry,
  "telecharger-en-png": DownloadWindowEntry,
};

export const EntryView = ({ slug }: { slug: EntrySlug }) => {
  const View = ENTRY_VIEWS[slug];
  return <View />;
};

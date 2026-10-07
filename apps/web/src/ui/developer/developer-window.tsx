// La fenêtre Développeur (écart §10.3, JOURNAL 2026-10-06 et 2026-10-07) : ouverte par le bouton de la pill Compte, pour le
// seul développeur. Ses trois sections à lui, Ce canvas, Tout LivePlace et Capacité ; celles des réglages n'y sont pas. Plus grande
// que celle des réglages sur PC, une feuille sur mobile.

import { Frame, Gauge, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { Window, type WindowSection } from "../design/window";

export type DeveloperSectionId = "here" | "all" | "capacity";

// Dans l'ordre du cahier des charges ; elle s'ouvre sur la première.
export const DEVELOPER_SECTIONS = [
  { id: "here", label: "Ce canvas", icon: Frame },
  { id: "all", label: "Tout LivePlace", icon: Globe },
  { id: "capacity", label: "Capacité", icon: Gauge },
] as const satisfies readonly WindowSection<DeveloperSectionId>[];

export const FIRST_DEVELOPER_SECTION: DeveloperSectionId = "here";

type DeveloperWindowProps = {
  isOpen: boolean;
  sectionId: DeveloperSectionId;
  onSelect: (sectionId: DeveloperSectionId) => void;
  onClose: () => void;
  children: ReactNode; // le contenu de la section choisie
};

export const DeveloperWindow = ({ isOpen, sectionId, onSelect, onClose, children }: DeveloperWindowProps) => (
  <Window
    isOpen={isOpen}
    sections={DEVELOPER_SECTIONS}
    sectionId={sectionId}
    onSelect={onSelect}
    onClose={onClose}
    isLarge
  >
    {children}
  </Window>
);

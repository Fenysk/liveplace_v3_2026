// La fenêtre Développeur (écart §10.3, JOURNAL 2026-10-06) : ouverte par le bouton de la pill Compte, pour le seul
// développeur. Ses sections à lui, Activité pour l'instant ; celles des réglages n'y sont pas. Sur mobile, une feuille.

import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { Window } from "../design/window";

const ACTIVITY_SECTION = { id: "activity", label: "Activité", icon: Activity } as const;
const DEVELOPER_SECTIONS = [ACTIVITY_SECTION];

const doNothing = (): void => undefined;

type DeveloperWindowProps = { isOpen: boolean; onClose: () => void; children: ReactNode };

export const DeveloperWindow = ({ isOpen, onClose, children }: DeveloperWindowProps) => (
  <Window
    isOpen={isOpen}
    sections={DEVELOPER_SECTIONS}
    sectionId={ACTIVITY_SECTION.id}
    onSelect={doNothing}
    onClose={onClose}
  >
    {children}
  </Window>
);

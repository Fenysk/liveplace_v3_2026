// La fenêtre du téléchargement (Écart §15, JOURNAL 2026-10-06) : le fond du PNG, transparent, noir ou blanc, à choisir.
// Aucun fond n'est présélectionné : Télécharger reste inactif tant que le choix n'est pas fait, et il ferme la fenêtre.

import { Button } from "../design/button";
import { SwatchChoice, type SwatchOption } from "../design/palette";
import { SmallWindow } from "../design/window";
import type { PngBackground } from "./png-export";

// Le noir et le blanc sont des teintes de la palette (des classes, qui lisent les tokens du vrai noir et du vrai blanc).
// Sans teinte, la pastille est le damier du transparent.
export const PNG_BACKGROUND_OPTIONS: readonly SwatchOption<PngBackground>[] = [
  { value: "transparent", label: "Transparent" },
  { value: "black", label: "Noir", tone: "png-black" },
  { value: "white", label: "Blanc", tone: "png-white" },
];

type DownloadWindowProps = {
  isOpen: boolean;
  background: PngBackground | null; // aucun n'est présélectionné
  onBackground: (background: PngBackground) => void;
  isCompact: boolean; // pastilles rondes, de la taille d'un contrôle
  onConfirm: () => void;
  onClose: () => void;
};

export const DownloadWindow = ({
  isOpen,
  background,
  onBackground,
  isCompact,
  onConfirm,
  onClose,
}: DownloadWindowProps) => (
  <SmallWindow
    isOpen={isOpen}
    title="Télécharger en PNG"
    onClose={onClose}
    actions={
      <>
        <Button label="Annuler" kbd="Échap" onPress={onClose} />
        <Button label="Télécharger" variant="primary" isDisabled={background === null} onPress={onConfirm} />
      </>
    }
  >
    <p className="lp-type-body lp-prompt">
      Seules les cases vides du dessin prennent le fond ; les cases colorées ne changent pas.
    </p>
    <SwatchChoice
      label="Fond de l'image"
      options={PNG_BACKGROUND_OPTIONS}
      value={background}
      onSelect={onBackground}
      isTouch={isCompact}
    />
  </SmallWindow>
);

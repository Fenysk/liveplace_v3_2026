// La fenêtre du téléchargement (Écart §15, JOURNAL 2026-10-06) : le fond du PNG, transparent, noir ou blanc, à choisir.
// Aucun fond n'est présélectionné : Télécharger reste inactif tant que le choix n'est pas fait, et il ferme la fenêtre.

import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { SwatchChoice, type SwatchOption } from "../design/palette";
import { SmallWindow } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { ARCHIVE_TEXTS } from "./archive-texts";
import type { PngBackground } from "./png-export";

// Le noir et le blanc sont des teintes de la palette (des classes, qui lisent les tokens du vrai noir et du vrai blanc).
// Sans teinte, la pastille est le damier du transparent.
export const pngBackgroundOptions = (
  names: Record<PngBackground, string>,
): readonly SwatchOption<PngBackground>[] => [
  { value: "transparent", label: names.transparent },
  { value: "black", label: names.black, tone: "png-black" },
  { value: "white", label: names.white, tone: "png-white" },
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
}: DownloadWindowProps) => {
  const t = useTexts(ARCHIVE_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  return (
    <SmallWindow
      isOpen={isOpen}
      title={t.downloadAsPng}
      onClose={onClose}
      actions={
        <>
          <Button label={design.cancel} kbd={design.escapeKey} onPress={onClose} />
          <Button label={t.download} variant="primary" isDisabled={background === null} onPress={onConfirm} />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">{t.pngBackgroundSentence}</p>
      <SwatchChoice
        label={t.pngBackgroundLabel}
        options={pngBackgroundOptions(design.backgroundNames)}
        value={background}
        onSelect={onBackground}
        isTouch={isCompact}
      />
    </SmallWindow>
  );
};

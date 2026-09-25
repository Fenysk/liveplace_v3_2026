// La confirmation d'une modération (CDC 2026, JOURNAL 2026-09-25) : une petite fenêtre, l'aperçu des pixels qui
// partent, leur nombre, puis Annuler ou l'action. L'affichage seul, nourri par `useModeration`.

import type { InspectEntry, Pixel } from "@liveplace/domain/ports";
import { useEffect, useState } from "react";
import type { ModerationAction } from "../../state/canvas-store";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { SmallWindow } from "../design/window";
import { CONNECTION_LOST, pixelCountLabel } from "./moderation-texts";

// Ce que la pill Inspection propose : retirer ses pixels, ou le bannir (qui les retire aussi).
export type ModerationKind = Extract<ModerationAction["action"], "clearUser" | "ban">;

// La cible est l'auteur affiché au moment du clic, jamais la case relue : elle peut changer pendant qu'on hésite.
export type ModerationRequest = { kind: ModerationKind; author: InspectEntry };

// `running` : verrouillée jusqu'à la dernière tranche. `failed` : la fenêtre reste ouverte et le dit.
export type ModerationStatus = "idle" | "running" | "failed";

export type CanvasPreviewProps = { width: number; height: number; palette: readonly string[] };

export type ModerationWindowProps = {
  request: ModerationRequest | null; // `null` : fermée
  pixels: readonly Pixel[] | null; // `null` : l'aperçu se charge
  status: ModerationStatus;
  canvas: CanvasPreviewProps;
  onConfirm: () => void;
  onClose: () => void;
};

const TEXTS: Record<
  ModerationKind,
  { title: (name: string) => string; consequence: string; confirm: string }
> = {
  clearUser: {
    title: (name) => `Retirer les pixels de ${name} ?`,
    consequence: "Ceux du dessous reviendront.",
    confirm: "Retirer",
  },
  ban: {
    title: (name) => `Bannir ${name} ?`,
    consequence: "Ce compte ne pourra plus poser sur ce canvas, et ses pixels seront retirés.",
    confirm: "Bannir",
  },
};

// La fenêtre garde la dernière demande pendant qu'elle se ferme : son contenu s'efface avec elle.
const useShownRequest = (request: ModerationRequest | null) => {
  const [lastShown, setLastShown] = useState(request);
  useEffect(() => {
    if (request) setLastShown(request);
  }, [request]);
  return request ?? lastShown;
};

type PreviewProps = Pick<ModerationWindowProps, "pixels" | "canvas"> & { author: InspectEntry };

const Preview = ({ pixels, canvas, author }: PreviewProps) => {
  if (!pixels) return <span className="lp-type-caption lp-muted">Chargement de l'aperçu…</span>;
  if (pixels.length === 0) return null;
  return <PixelPreview {...canvas} pixels={pixels} label={`Les pixels de ${author.displayName}`} />;
};

export const ModerationWindow = ({
  request,
  pixels,
  status,
  canvas,
  onConfirm,
  onClose,
}: ModerationWindowProps) => {
  const shown = useShownRequest(request);
  if (!shown) return null;
  const texts = TEXTS[shown.kind];
  return (
    <SmallWindow
      isOpen={request !== null}
      title={texts.title(shown.author.displayName)}
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label="Annuler" kbd="Échap" onPress={onClose} />
          <Button label={texts.confirm} variant="danger" isDisabled={!pixels} onPress={onConfirm} />
        </>
      }
    >
      <Preview pixels={pixels} canvas={canvas} author={shown.author} />
      {pixels && (
        <p className="lp-type-body lp-prompt">
          {pixelCountLabel(pixels.length)}. {texts.consequence}
        </p>
      )}
      {status === "failed" && <p className="lp-type-caption lp-danger lp-prompt">{CONNECTION_LOST}</p>}
    </SmallWindow>
  );
};

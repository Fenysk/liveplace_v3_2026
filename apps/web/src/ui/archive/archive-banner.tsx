// Le bandeau d'une archive (Écart §15, JOURNAL 2026-10-06), en haut à gauche, à la place de la pill Canvas : à qui elle
// est (son avatar et son nom mènent à son canvas en cours), son titre et sa légende, puis Copier le lien et Télécharger
// en PNG. Sur mobile, les actions n'ont que leur icône. L'affichage seul.

import { Download, Link2 } from "lucide-react";
import { Button, type ButtonIcon } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { Profile, type ProfileUser } from "../design/profile";
import { useTexts } from "../locale/use-locale";
import { ARCHIVE_TEXTS } from "./archive-texts";

const DOCK: PillDock = "tl";

type BannerActionProps = {
  icon: ButtonIcon;
  label: string;
  isCompact: boolean;
  isDisabled?: boolean;
  onPress: () => void;
};

// Un libellé sur PC, son infobulle seule sur mobile : la place manque à côté de la pill Compte.
const BannerAction = ({ label, isCompact, ...action }: BannerActionProps) =>
  isCompact ? <Button title={label} {...action} /> : <Button label={label} {...action} />;

type ArchiveBannerProps = {
  owner: ProfileUser; // le streamer de l'archive : l'avatar et le nom mènent à son canvas en cours
  title: string;
  caption: string;
  isDownloading: boolean; // le PNG se prépare : Télécharger attend
  onCopyLink: () => void;
  onDownload: () => void;
  isCompact?: boolean;
  isDocked?: boolean;
};

export const ArchiveBanner = ({
  owner,
  title,
  caption,
  isDownloading,
  onCopyLink,
  onDownload,
  isCompact = false,
  isDocked = true,
}: ArchiveBannerProps) => {
  const t = useTexts(ARCHIVE_TEXTS);
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="stack">
      <div className="lp-archive-banner">
        <Profile user={owner} variant={isCompact ? "name" : "full"} />
        <p className="lp-type-title lp-prompt">{title}</p>
        <p className="lp-type-caption lp-muted lp-prompt">{caption}</p>
        <div className="lp-row lp-row--ruled">
          <BannerAction icon={Link2} label={t.copyLink} isCompact={isCompact} onPress={onCopyLink} />
          <BannerAction
            icon={Download}
            label={t.downloadAsPng}
            isCompact={isCompact}
            isDisabled={isDownloading}
            onPress={onDownload}
          />
        </div>
      </div>
    </Pill>
  );
};

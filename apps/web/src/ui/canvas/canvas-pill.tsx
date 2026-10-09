// La pill Canvas (CDC 2026), en haut à gauche : à qui est ce canvas. Le streamer sur son canvas ne l'a pas : ses
// Réglages sont dans la pill Compte.

import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, Profile, type ProfileUser } from "../design/profile";

const DOCK: PillDock = "tl";

// Écart §8.1 (JOURNAL 2026-10-08, 2026-10-09) : la page replie la pill quand on déplace, zoome, recentre ou ouvre une case, et la déplie au toucher.
export type CanvasPillFold = { isFolded: boolean; onUnfold: () => void };

type CanvasPillProps = {
  owner: ProfileUser;
  isCompact?: boolean;
  isDocked?: boolean;
  fold?: CanvasPillFold;
};

const foldedTitle = ({ displayName, twitchLive }: ProfileUser): string =>
  `Déplier le profil de ${displayName}${twitchLive ? ", en live sur Twitch" : ""}`;

// Sur mobile, la place manque : le nom sans l'icône Twitch (design system, CanvasPage), et la photo seule une fois repliée,
// avec le rond du live. Le PC ne se replie jamais.
export const CanvasPill = ({ owner, isCompact = false, isDocked = true, fold }: CanvasPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined}>
    {isCompact && fold?.isFolded ? (
      <AvatarButton
        user={owner}
        title={foldedTitle(owner)}
        isLive={Boolean(owner.twitchLive)}
        isExpanded={false}
        onPress={fold.onUnfold}
      />
    ) : (
      <Profile user={owner} variant={isCompact ? "name" : "full"} />
    )}
  </Pill>
);

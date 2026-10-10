// La pill Canvas (CDC 2026), en haut à gauche : à qui est ce canvas. Le streamer sur son canvas ne l'a pas : ses
// Réglages sont dans la pill Compte.

import { Pill, type PillDock } from "../design/pill";
import { AvatarButton, Profile, type ProfileUser } from "../design/profile";
import { useTexts } from "../locale/use-locale";
import { CANVAS_TEXTS } from "./canvas-texts";

const DOCK: PillDock = "tl";

// Écart §8.1 (JOURNAL 2026-10-08, 2026-10-09) : la page replie la pill quand on déplace, zoome, recentre ou ouvre une case, et la déplie au toucher.
export type CanvasPillFold = { isFolded: boolean; onUnfold: () => void };

type CanvasPillProps = {
  owner: ProfileUser;
  isCompact?: boolean;
  isDocked?: boolean;
  fold?: CanvasPillFold;
};

// Sur mobile, la place manque : le nom sans l'icône Twitch (design system, CanvasPage), et la photo seule une fois repliée,
// avec le rond du live. Le PC ne se replie jamais.
export const CanvasPill = ({ owner, isCompact = false, isDocked = true, fold }: CanvasPillProps) => {
  const t = useTexts(CANVAS_TEXTS);
  return (
    <Pill dock={isDocked ? DOCK : undefined}>
      {isCompact && fold?.isFolded ? (
        <AvatarButton
          user={owner}
          title={t.unfoldProfile({ name: owner.displayName, isLive: Boolean(owner.twitchLive) })}
          isLive={Boolean(owner.twitchLive)}
          isExpanded={false}
          onPress={fold.onUnfold}
        />
      ) : (
        <Profile user={owner} variant={isCompact ? "name" : "full"} />
      )}
    </Pill>
  );
};

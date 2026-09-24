// La pill Canvas (CDC 2026), en haut à gauche : à qui est ce canvas. Les réglages du streamer arrivent avec leur fonctionnalité.

import { Pill, type PillDock } from "../design/pill";
import { Profile, type ProfileUser } from "../design/profile";

const DOCK: PillDock = "tl";

type CanvasPillProps = { owner: ProfileUser; isCompact?: boolean; isDocked?: boolean };

// Sur mobile, la place manque : le nom sans l'icône Twitch (design system, CanvasPage).
export const CanvasPill = ({ owner, isCompact = false, isDocked = true }: CanvasPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined}>
    <Profile user={owner} variant={isCompact ? "name" : "full"} />
  </Pill>
);

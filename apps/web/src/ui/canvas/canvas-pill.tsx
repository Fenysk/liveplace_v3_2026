// La pill Canvas (CDC 2026), en haut à gauche : à qui est ce canvas, et pour le streamer, ses réglages (la fenêtre,
// ouverte sur Vue OBS).

import { Settings } from "lucide-react";
import { Button } from "../design/button";
import { Pill, type PillDock } from "../design/pill";
import { Profile, type ProfileUser } from "../design/profile";

const DOCK: PillDock = "tl";

type CanvasPillProps = {
  owner: ProfileUser;
  onOpenSettings?: (() => void) | undefined; // absent : ce n'est pas le streamer
  isCompact?: boolean;
  isDocked?: boolean;
};

// Sur mobile, la place manque : le nom sans l'icône Twitch (design system, CanvasPage).
export const CanvasPill = ({
  owner,
  onOpenSettings,
  isCompact = false,
  isDocked = true,
}: CanvasPillProps) => (
  <Pill dock={isDocked ? DOCK : undefined}>
    <Profile user={owner} variant={isCompact ? "name" : "full"} />
    {onOpenSettings && <Button icon={Settings} variant="ghost" title="Réglages" onPress={onOpenSettings} />}
  </Pill>
);

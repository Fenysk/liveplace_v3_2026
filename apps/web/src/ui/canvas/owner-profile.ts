// Le profil du streamer d'une page (pill Canvas, bandeau d'archive), avec son live (§10.4) : celui que
// le serveur a lu au rendu, puis, dès le `welcome`, celui du gateway, qui le redit à chaque changement.

import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import type { ProfileUser } from "../design/profile";

const noSubscription = () => () => undefined;

// Avant le `welcome`, le live du rendu serveur fait foi ; ensuite, celui du gateway, même absent : le streamer n'est plus en live.
export const toOwnerProfile = (
  { twitchLive: renderedLive, ...owner }: ProfileUser,
  { ownerId, ownerTwitchLive }: Pick<CanvasView, "ownerId" | "ownerTwitchLive">,
): ProfileUser => {
  const twitchLive = ownerId === undefined ? renderedLive : ownerTwitchLive;
  return { ...owner, ...(twitchLive ? { twitchLive } : {}) };
};

// Avant les stores (rendu serveur, puis le temps de les ouvrir), le profil est celui du serveur.
export const useOwnerProfile = (canvas: CanvasStore | undefined, owner: ProfileUser): ProfileUser => {
  const getView = () => canvas?.getView();
  const view = useSyncExternalStore(canvas?.subscribe ?? noSubscription, getView, getView);
  return view ? toOwnerProfile(owner, view) : owner;
};

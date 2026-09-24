// Les exemples de /design : des utilisateurs de démonstration, et rien d'autre. Aucune connexion, aucun store.

import type { ProfileUser } from "../design/profile";
import sampleAvatarUrl from "./sample-avatar.svg?url";

export const SAMPLE_OWNER: ProfileUser = {
  displayName: "Kalyss",
  login: "kalyss",
  avatarUrl: sampleAvatarUrl,
};
export const SAMPLE_VIEWER: ProfileUser = { displayName: "pixelmoth", login: "pixelmoth" };
// Une photo qui ne charge pas : l'initiale prend le relais.
export const SAMPLE_BROKEN_PHOTO: ProfileUser = {
  displayName: "Nuagelle",
  login: "nuagelle",
  avatarUrl: "/photo-introuvable.png",
};

// Un clic sur /design ne fait rien : les exemples montrent un état, pas un comportement.
export const noop = (): void => undefined;

// Écart §4 (JOURNAL 2026-10-07) : au démarrage du web, tous les comptes connus sont suivis en arrière-plan : abonnés à Twitch
// et dotés de leur état de départ, sans attendre une connexion ou une visite.

import type { AccountList } from "@liveplace/domain/ports";
import type { TwitchLiveTracker } from "./twitch-live";

// Un compte toutes les 400 ms, soit 150 par minute : 2 à 5 appels chacun, sous les 800 par minute de l'application.
const PACE_MS = 400;

export type TrackKnownAccountsDeps = {
  accounts: AccountList;
  tracker: Pick<TwitchLiveTracker, "track">;
  wait: (ms: number) => Promise<void>;
};

// Ne rejette jamais : un échec de la liste ou d'un suivi est journalisé, le démarrage n'en dépend pas.
export async function trackKnownAccounts({ accounts, tracker, wait }: TrackKnownAccountsDeps): Promise<void> {
  let userIds: string[];
  try {
    userIds = await accounts.listAccountIds();
  } catch (error) {
    console.error("twitch live : comptes connus illisibles au démarrage", error);
    return;
  }
  for (const userId of userIds) {
    try {
      tracker.track(userId);
    } catch (error) {
      console.error(`twitch live : suivi de ${userId} impossible au démarrage`, error);
    }
    await wait(PACE_MS);
  }
}

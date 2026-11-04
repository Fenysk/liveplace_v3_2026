// La politique de confidentialité tenue en tâche de fond (JOURNAL 2026-11-04) : un don jamais relié part 12 mois après sa date, la
// preuve d'un effacement de compte 5 ans après lui. Un passage par heure, par lots bornés ; chaque lot efface ses lignes, donc
// un passage interrompu reprend où il en est sans curseur.

import type { ExpiryPage, ExpiryStore } from "@liveplace/domain/ports";
import { deletionProofCutoff, unlinkedDonationCutoff } from "@liveplace/domain/retention";

const CHECK_MS = 60 * 60_000; // un passage par heure : 24 appels Convex par jour et par sorte de ligne quand rien n'a expiré
const RETRY_MS = 5 * 60_000;
const TICK_BUDGET_MS = 5_000; // un tour rend la main au bail et aux autres cycles

export type ExpiryCycleDeps = {
  store: ExpiryStore;
  now(): number;
  log(message: string, error?: unknown): void;
};

export function createExpiryCycle({ store, now, log }: ExpiryCycleDeps) {
  let nextAt = 0;
  const purged = { donations: 0, proofs: 0 }; // depuis le début du passage en cours

  // Les lots jusqu'au dernier, tant que le budget du tour le permet. Vrai : cette sorte de ligne est à jour.
  const purgeAll = async (
    purgeBatch: () => Promise<ExpiryPage>,
    kind: keyof typeof purged,
    startedAt: number,
  ): Promise<boolean> => {
    for (;;) {
      const page = await purgeBatch();
      purged[kind] += page.purged;
      if (page.isDone) return true;
      if (now() - startedAt >= TICK_BUDGET_MS) return false;
    }
  };

  return {
    async tick(): Promise<void> {
      const startedAt = now();
      if (startedAt < nextAt) return;
      try {
        const isDonationsDone = await purgeAll(
          () => store.purgeUnlinkedDonations(unlinkedDonationCutoff(now())),
          "donations",
          startedAt,
        );
        const isProofsDone =
          isDonationsDone &&
          (await purgeAll(() => store.purgeDeletionProofs(deletionProofCutoff(now())), "proofs", startedAt));
        if (!isProofsDone) return; // la suite au tour suivant
        if (purged.donations + purged.proofs > 0)
          log(
            `${purged.donations} don(s) non relié(s) et ${purged.proofs} preuve(s) d'effacement expirés effacés de Convex`,
          );
        purged.donations = 0;
        purged.proofs = 0;
        nextAt = now() + CHECK_MS;
      } catch (error) {
        nextAt = now() + RETRY_MS;
        log("effacement des lignes expirées interrompu, il reprend dans 5 min", error);
      }
    },
  };
}

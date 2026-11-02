// CDC §8, Supprimer son compte : le ménage des fichiers de Convex qu'aucune ligne ne désigne (JOURNAL 2026-11-02). Un passage par
// heure, par lots bornés ; la borne du dernier fichier vu reste en mémoire, un passage ne relit donc que les fichiers arrivés depuis.

import type { OrphanStore } from "@liveplace/domain/ports";
import { ORPHAN_GRACE_MS } from "@liveplace/domain/retention";

const CHECK_MS = 60 * 60_000; // un passage par heure : 24 appels Convex par jour quand rien n'est arrivé
const RETRY_MS = 5 * 60_000;
const FILES_PER_CALL = 100; // trois lectures d'index par fichier dans une transaction
const TICK_BUDGET_MS = 5_000; // un tour rend la main au bail et aux autres cycles

export type OrphanCycleDeps = {
  store: OrphanStore;
  now(): number;
  log(message: string, error?: unknown): void;
};

export function createOrphanCycle({ store, now, log }: OrphanCycleDeps) {
  let after = 0; // la borne : rien d'avant n'a besoin d'être relu, un fichier désigné ne devient jamais orphelin
  let nextAt = 0;
  let removed = 0; // depuis le début du passage en cours

  // Les pages jusqu'à la dernière, tant que le budget du tour le permet. Vrai : le passage est fini.
  const advance = async (startedAt: number): Promise<boolean> => {
    for (;;) {
      const page = await store.purgeOrphans(after, ORPHAN_GRACE_MS, FILES_PER_CALL);
      // Une borne qui n'avance pas sur une page pleine (des centaines de fichiers du même instant) ne mène nulle part.
      const isStuck = !page.isDone && page.next <= after;
      after = page.next;
      removed += page.deleted;
      if (page.isDone || isStuck) return true;
      if (now() - startedAt >= TICK_BUDGET_MS) return false;
    }
  };

  return {
    async tick(): Promise<void> {
      const startedAt = now();
      if (startedAt < nextAt) return;
      try {
        if (!(await advance(startedAt))) return; // la suite au tour suivant
        if (removed > 0) log(`${removed} fichier(s) sans ligne retiré(s) de Convex`);
        removed = 0;
        nextAt = now() + CHECK_MS;
      } catch (error) {
        nextAt = now() + RETRY_MS;
        log("ménage des fichiers sans ligne interrompu, il reprend dans 5 min", error);
      }
    },
  };
}

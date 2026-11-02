// CDC §8, Supprimer son compte : le bouton de Mon compte. Le compte est celui du cookie, jamais un paramètre. Dès que
// l'effacement est inscrit dans `deletions:pending`, il est acquis : le web attend la routine un temps borné, puis répond
// succès même si elle tourne encore, car la reprise la finit (JOURNAL 2026-11-02). Avant l'inscription, une erreur se dit et le
// compte reste entier.

import type { SessionVerifier } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import type { BeganDeletion, DeleteAccountRequest } from "./delete-account";
import { withOwnerSession } from "./owner-session";

// Assez pour un compte ordinaire (une fresque, quelques traces) ; au-delà, la page rentre sans attendre la fin.
export const DELETE_WAIT_MS = 10_000;

export type DeleteOwnAccountDeps = {
  verifier: SessionVerifier;
  beginDeletion: (request: DeleteAccountRequest) => Promise<Result<BeganDeletion, "failed">>;
  waitMs: number;
};

export async function deleteOwnAccount(
  { verifier, beginDeletion, waitMs }: DeleteOwnAccountDeps,
  cookieHeader: string | undefined,
): Promise<Result<void, "unauthenticated" | "failed">> {
  return withOwnerSession(verifier, cookieHeader, async (userId) => {
    const began = await beginDeletion({ userId, trigger: "button" });
    if (!began.ok) return began;
    // Inscrit : même une routine qui échoue ensuite reprend seule. Le délai ne compte que pour ne pas faire attendre la page.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs);
    });
    await Promise.race([began.value.done, timeout]);
    clearTimeout(timer);
    return { ok: true, value: undefined };
  });
}

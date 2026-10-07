// Écart §10.3 (JOURNAL 2026-10-06) : archiver, rouvrir, supprimer et lister n'ont qu'un propriétaire : celui du cookie.
// Jamais un paramètre envoyé par le client ; sans session, rien ne se fait.

import type { Session } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";

export async function withOwnerSession<Value, Refusal extends string>(
  verifier: SessionVerifier,
  cookieHeader: string | undefined,
  run: (ownerId: string) => Promise<Result<Value, Refusal>>,
): Promise<Result<Value, Refusal | "unauthenticated">> {
  let session: Session | null = null;
  try {
    session = await verifier.verify(cookieHeader);
  } catch (error) {
    console.error("canvases : cookie de session non vérifié", error);
  }
  if (!session) return { ok: false, error: "unauthenticated" };
  return run(session.userId);
}

// La page poste l'image du fond au web (Écart §9.1, JOURNAL 2026-10-10) : `POST /{login}/background?canvas=<id>`, le cookie de session
// part avec. Jamais à Convex : la CSP `default-src 'self'` ne l'ouvre pas.

import type { Result } from "@liveplace/shared";

// Les raisons que `background-image-response.ts` donne, plus `network` : la requête n'a pas abouti.
const REASONS = [
  "too_big",
  "invalid_image",
  "not_active",
  "unauthenticated",
  "bad_request",
  "failed",
] as const;
export type UploadFailure = (typeof REASONS)[number] | "network";

const isReason = (value: unknown): value is (typeof REASONS)[number] =>
  REASONS.some((reason) => reason === value);

export type UploadRequest = { login: string; canvasId: string; image: Blob };

export async function uploadBackgroundImage(
  { login, canvasId, image }: UploadRequest,
  send: typeof fetch = fetch,
): Promise<Result<void, UploadFailure>> {
  let response: Response;
  try {
    response = await send(`/${encodeURIComponent(login)}/background?canvas=${encodeURIComponent(canvasId)}`, {
      method: "POST",
      body: image,
      credentials: "same-origin",
    });
  } catch (error) {
    console.error("image du fond : envoi sans réponse", error);
    return { ok: false, error: "network" };
  }
  const reply: unknown = await response.json().catch(() => null);
  if (typeof reply === "object" && reply !== null && "ok" in reply && reply.ok === true)
    return { ok: true, value: undefined };
  const reason = typeof reply === "object" && reply !== null && "error" in reply ? reply.error : null;
  return { ok: false, error: isReason(reason) ? reason : "failed" };
}

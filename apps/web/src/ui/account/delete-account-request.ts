// La page demande l'effacement de son compte au web (CDC §8) : `POST /auth/delete-account`, le cookie de session part avec.

import type { Result } from "@liveplace/shared";
import {
  DELETE_ACCOUNT_REASONS,
  type DeleteAccountFailure,
  type DeleteAccountReason,
} from "../../state/account-deletion";

const isReason = (value: unknown): value is DeleteAccountReason =>
  DELETE_ACCOUNT_REASONS.some((reason) => reason === value);

export async function requestAccountDeletion(
  send: typeof fetch = fetch,
): Promise<Result<void, DeleteAccountFailure>> {
  let response: Response;
  try {
    response = await send("/auth/delete-account", { method: "POST", credentials: "same-origin" });
  } catch (error) {
    console.error("compte : suppression sans réponse", error);
    return { ok: false, error: "network" };
  }
  const reply: unknown = await response.json().catch(() => null);
  if (typeof reply === "object" && reply !== null && "ok" in reply && reply.ok === true)
    return { ok: true, value: undefined };
  const reason = typeof reply === "object" && reply !== null && "error" in reply ? reply.error : null;
  return { ok: false, error: isReason(reason) ? reason : "failed" };
}

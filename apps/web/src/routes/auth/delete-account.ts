// `POST /auth/delete-account` : efface le compte de la session, et son cookie dans la même réponse (CDC §8). Jamais en GET.

import { createFileRoute } from "@tanstack/react-router";
import { deleteAccountResponse } from "../../ui/account/delete-account-response";
import { DELETE_WAIT_MS } from "../../usecase/delete-own-account";

export const Route = createFileRoute("/auth/delete-account")({
  server: {
    handlers: {
      POST: ({ request, context: { deps } }) =>
        deleteAccountResponse(
          {
            deletion: { verifier: deps.verifier, beginDeletion: deps.beginDeletion, waitMs: DELETE_WAIT_MS },
            publicUrl: deps.publicUrl,
            isSecure: deps.isSecure,
          },
          request,
        ),
    },
  },
});

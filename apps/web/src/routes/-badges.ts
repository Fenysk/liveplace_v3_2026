// JOURNAL 2026-11-03 : Mon compte lit son Soutien, la section Badges de la fenêtre Développeur lit les titulaires et les dons non
// reliés, et relie un don à un compte. Des fonctions serveur `POST` : le cookie `lp_session` fait foi, jamais un paramètre, et la
// section Badges refuse toute session qui n'est pas celle du développeur. Le tiret en tête du nom : le routeur ignore ce fichier.

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  getBadgesReport,
  getMySupportTitle,
  linkWaitingDonation,
  withDeveloperSession,
} from "../usecase/badges-section";
import { withOwnerSession } from "../usecase/owner-session";

// L'identifiant d'un don vient de Convex, opaque ; le pseudo Twitch tient en 25 caractères, « @ » compris avec de la marge.
const LinkRequestSchema = z.object({ donationId: z.string().min(1).max(100), login: z.string().max(60) });

export const getMySupportFn = createServerFn({ method: "POST" }).handler(({ context }) =>
  withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (userId) =>
    getMySupportTitle(context.deps.donations, userId),
  ),
);

export const getBadgesReportFn = createServerFn({ method: "POST" }).handler(({ context }) =>
  withDeveloperSession(context.deps.verifier, getRequestHeader("cookie"), () =>
    getBadgesReport(context.deps.donations, context.deps.now()),
  ),
);

export const linkDonationFn = createServerFn({ method: "POST" })
  .validator(LinkRequestSchema)
  .handler(({ data, context }) =>
    withDeveloperSession(context.deps.verifier, getRequestHeader("cookie"), () =>
      linkWaitingDonation(
        { donations: context.deps.donations, redis: context.deps.redis },
        data.donationId,
        data.login,
      ),
    ),
  );

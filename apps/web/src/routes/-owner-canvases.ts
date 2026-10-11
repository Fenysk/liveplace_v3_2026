// Écart §10.3 (JOURNAL 2026-10-06) : lister, archiver, rouvrir, supprimer et régler le thème, des fonctions serveur `POST`. Le cookie
// `lp_session` (`HttpOnly; SameSite=Lax`) ne part pas d'un autre site : sans lui, aucune ne fait rien, et le propriétaire
// est toujours celui de la session, jamais un paramètre. Le tiret en tête du nom : le routeur ignore ce fichier.

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { archiveCanvas } from "../usecase/archive-canvas";
import { clearCanvasBackgroundImage } from "../usecase/canvas-background-image";
import type { SwitchDeps } from "../usecase/canvas-switch";
import { discardOwnerArchive } from "../usecase/discard-owner-archive";
import { listCanvases } from "../usecase/list-canvases";
import { withOwnerSession } from "../usecase/owner-session";
import { reopenCanvas } from "../usecase/reopen-canvas";
import { setCanvasTheme } from "../usecase/set-canvas-theme";

// Les identifiants de canvas sont des UUID : une borne large suffit à refuser ce qui n'en est pas.
export const CanvasIdSchema = z.string().min(1).max(100);
const ProgressChoiceSchema = z.enum(["keep", "restart"]);

// Le thème est nettoyé par `toTheme` : ici, seulement une borne pour ne pas lire un corps démesuré.
const ArchiveRequestSchema = z.object({
  canvasId: CanvasIdSchema,
  theme: z.string().max(400),
  progress: ProgressChoiceSchema,
});
const ReopenRequestSchema = z.object({ canvasId: CanvasIdSchema, progress: ProgressChoiceSchema });
const DiscardRequestSchema = z.object({ canvasId: CanvasIdSchema });
// Même borne que l'archivage : `toTheme` nettoie et coupe à 40 caractères.
const ThemeRequestSchema = z.object({ canvasId: CanvasIdSchema, theme: z.string().max(400) });
const BackgroundImageRequestSchema = z.object({ canvasId: CanvasIdSchema });

// Ce que le contexte du serveur donne aux usecases : les mêmes dépendances pour les quatre.
type OwnerCanvasDeps = {
  durable: SwitchDeps["durable"];
  archiveWrites: SwitchDeps["redis"];
  now: SwitchDeps["now"];
  randomCanvasId: SwitchDeps["randomCanvasId"];
  randomLinkCode: SwitchDeps["randomLinkCode"];
};

const toSwitchDeps = ({
  durable,
  archiveWrites,
  now,
  randomCanvasId,
  randomLinkCode,
}: OwnerCanvasDeps): SwitchDeps => ({
  durable,
  redis: archiveWrites,
  now,
  randomCanvasId,
  randomLinkCode,
});

export const listCanvasesFn = createServerFn({ method: "POST" }).handler(({ context }) =>
  withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (ownerId) =>
    listCanvases({ durable: context.deps.durable, redis: context.deps.archiveWrites }, ownerId),
  ),
);

export const archiveCanvasFn = createServerFn({ method: "POST" })
  .validator(ArchiveRequestSchema)
  .handler(({ data, context }) =>
    withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (ownerId) =>
      archiveCanvas(toSwitchDeps(context.deps), ownerId, data),
    ),
  );

export const reopenCanvasFn = createServerFn({ method: "POST" })
  .validator(ReopenRequestSchema)
  .handler(({ data, context }) =>
    withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (ownerId) =>
      reopenCanvas(toSwitchDeps(context.deps), ownerId, data),
    ),
  );

export const discardArchiveFn = createServerFn({ method: "POST" })
  .validator(DiscardRequestSchema)
  .handler(({ data, context }) =>
    withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (ownerId) =>
      discardOwnerArchive(toSwitchDeps(context.deps), ownerId, data),
    ),
  );

export const setCanvasThemeFn = createServerFn({ method: "POST" })
  .validator(ThemeRequestSchema)
  .handler(({ data, context }) =>
    withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (ownerId) =>
      setCanvasTheme({ durable: context.deps.durable, redis: context.deps.archiveWrites }, ownerId, data),
    ),
  );

// Écart §9.1 (JOURNAL 2026-10-10) : retirer l'image du fond. La poser est la requête `POST /{login}/background`, qui porte les octets.
export const clearCanvasBackgroundImageFn = createServerFn({ method: "POST" })
  .validator(BackgroundImageRequestSchema)
  .handler(({ data, context }) =>
    withOwnerSession(context.deps.verifier, getRequestHeader("cookie"), (ownerId) =>
      clearCanvasBackgroundImage(
        { durable: context.deps.durable, redis: context.deps.archiveWrites },
        ownerId,
        data,
      ),
    ),
  );

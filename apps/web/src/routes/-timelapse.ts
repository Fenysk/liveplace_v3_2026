// JOURNAL 2026-11-11 : le GIF timelapse d'une fresque, une fonction serveur `POST` pour le développeur seul. Le cookie `lp_session` fait
// foi, jamais un paramètre : toute autre session reçoit `forbidden`. Le tiret en tête du nom : le routeur ignore ce fichier.

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { exportTimelapseAsDeveloper } from "../usecase/export-timelapse";
import { CanvasIdSchema } from "./-owner-canvases";

const TimelapseRequestSchema = z.object({ canvasId: CanvasIdSchema });

export const exportTimelapseFn = createServerFn({ method: "POST" })
  .validator(TimelapseRequestSchema)
  .handler(({ data, context }) =>
    exportTimelapseAsDeveloper(
      {
        source: context.deps.timelapseSource,
        chunks: context.deps.chunkReader,
        verifier: context.deps.verifier,
      },
      getRequestHeader("cookie"),
      data.canvasId,
    ),
  );

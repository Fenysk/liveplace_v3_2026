// Écart §4.2 (JOURNAL 2026-10-09) : ce que le web dit à une page dont le gateway ne trouve pas le canvas. Une fonction serveur
// `POST` : elle marque le canvas en récupération s'il est perdu et sauvegardé, et rend ce qu'il en est. Elle ne vérifie aucune
// session : le pire qu'un appel fasse est ce que le worker fait de toute façon. Le tiret en tête du nom : le routeur ignore ce fichier.

import { createServerFn } from "@tanstack/react-start";
import { markRecoveringIfLost } from "../usecase/mark-recovering";
import { CanvasIdSchema } from "./-owner-canvases";

export const getCanvasVerdictFn = createServerFn({ method: "POST" })
  .validator(CanvasIdSchema)
  .handler(({ data: canvasId, context }) =>
    markRecoveringIfLost({ marks: context.deps.recoveryMarks, recovery: context.deps.recovery }, canvasId),
  );

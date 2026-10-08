// Ce que fait `/{login}/archives/{code}` avant de s'afficher (Écart §15, JOURNAL 2026-10-06) : le propriétaire
// par son pseudo, l'archive par son code. Sans session : tous ceux qui ont le lien la voient, et rien ne la liste.
// Le tiret en tête du nom : le routeur ignore ce fichier, ce n'est pas une route.

import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { markRecoveringIfLost } from "../usecase/mark-recovering";
import { resolveArchive } from "../usecase/resolve-archive";

const ArchiveParamsSchema = z.object({ login: z.string().min(1).max(100), code: z.string().min(1).max(100) });

// Toujours exécutée sur le serveur, où que tourne le loader : la clé de Convex n'en sort jamais.
const getArchivePage = createServerFn({ method: "GET" })
  .validator(ArchiveParamsSchema)
  .handler(async ({ data, context }) => {
    const page = await resolveArchive(context.deps.durable, data.login, data.code, context.deps.tracker);
    // Écart §4.2 (JOURNAL 2026-10-08) : une archive que Redis a perdue se dit « en récupération » dès ce rendu.
    if (page?.status === "archived")
      await markRecoveringIfLost(
        { marks: context.deps.recoveryMarks, recovery: context.deps.recovery },
        page.archive.canvasId,
      );
    return page;
  });

type ArchivePageLoaderArgs = { params: { login: string; code: string } };

// Un code inconnu est un canvas introuvable, qui dit le nom affiché du streamer quand il existe ; celui d'une archive
// rouverte, redevenue le canvas actif, mène à `/{login}`.
export const resolveArchivePage = async ({ params }: ArchivePageLoaderArgs) => {
  const page = await getArchivePage({ data: params });
  if (!page) throw notFound();
  if (page.status === "missing") throw notFound({ data: { displayName: page.owner.displayName } });
  if (page.status === "active") throw redirect({ to: "/$login", params: { login: page.login } });
  return page.archive;
};

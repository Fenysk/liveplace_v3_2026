// `/{login}/archives/{code}` (Écart §15, JOURNAL 2026-10-06) : l'archive d'un canvas, en lecture seule, qui
// ne se trouve que par son lien. Une route non imbriquée, comme `/{login}/obs` : elle n'a rien de la page du jeu, et aucune
// vue OBS. `noindex` : un lien qu'on partage, jamais une page qu'un moteur de recherche liste.

import { createFileRoute, type NotFoundRouteProps } from "@tanstack/react-router";
import { ArchiveNotFound } from "../ui/archive/archive-not-found";
import { ArchivePage } from "../ui/archive/archive-page";
import { missingDisplayName } from "../ui/archive/archive-texts";
import { resolveArchivePage } from "./-archive-page";
import { noStoreHeaders } from "./-canvas-page";

const ArchiveRoute = () => {
  const archive = Route.useLoaderData();
  const { openCanvas } = Route.useRouteContext();
  return <ArchivePage archive={archive} openCanvas={openCanvas} />;
};

const MissingArchive = ({ data }: NotFoundRouteProps) => (
  <ArchiveNotFound login={Route.useParams().login} displayName={missingDisplayName(data)} />
);

export const Route = createFileRoute("/$login_/archives/$code")({
  loader: resolveArchivePage,
  headers: noStoreHeaders,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: ArchiveRoute,
  notFoundComponent: MissingArchive,
});

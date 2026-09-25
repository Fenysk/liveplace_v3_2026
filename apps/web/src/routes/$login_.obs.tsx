// `/{login}/obs` (§9.1) : la vue OBS forcée, pour la vérifier dans un navigateur normal. Aucune redirection n'y mène :
// dans OBS Studio comme dans Streamlabs, `/{login}` suffit.

import { createFileRoute } from "@tanstack/react-router";
import { ObsPage } from "../ui/obs/obs-page";
import { CanvasNotFound, noStoreHeaders, resolveCanvasPage } from "./-canvas-page";

const ForcedObsPage = () => {
  const { canvasId } = Route.useLoaderData();
  const { openCanvas } = Route.useRouteContext();
  return <ObsPage canvasId={canvasId} openCanvas={openCanvas} />;
};

export const Route = createFileRoute("/$login_/obs")({
  loader: resolveCanvasPage,
  headers: noStoreHeaders,
  component: ForcedObsPage,
  notFoundComponent: CanvasNotFound,
});

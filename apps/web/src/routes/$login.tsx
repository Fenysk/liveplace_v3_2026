// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute } from "@tanstack/react-router";

const CanvasPage = () => {
  const { canvasId } = Route.useLoaderData();
  return <main style={{ padding: 16 }}>Canvas « {canvasId} »</main>;
};

export const Route = createFileRoute("/$login")({
  // Écart §9.1 (JOURNAL 2026-09-19) : Convex résoudra le pseudo en canvas au J8.
  loader: ({ params }) => ({ canvasId: params.login }),
  component: CanvasPage,
});

// `GET /healthz` : 200 `ok` si Redis, le gateway et le worker répondent, sinon 503 et leurs noms (JOURNAL 2026-11-03).

import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "../ui/health/health-response";

export const Route = createFileRoute("/healthz")({
  server: { handlers: { GET: async ({ context }) => healthResponse(await context.deps.checkHealth()) } },
});

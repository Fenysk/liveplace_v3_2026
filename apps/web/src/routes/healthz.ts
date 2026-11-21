// `GET /healthz` : 200 `ok` si Redis, le gateway et le worker répondent, sinon 503 `unavailable` ; les noms en échec restent dans les journaux (JOURNAL 2026-11-03, amendé le 2026-11-21).

import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "../ui/health/health-response";

export const Route = createFileRoute("/healthz")({
  server: { handlers: { GET: async ({ context }) => healthResponse(await context.deps.checkHealth()) } },
});

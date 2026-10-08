import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/app/main.ts", healthcheck: "src/app/healthcheck.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  // Les packages du dépôt n'ont pas d'étape de build : ils entrent dans le bundle, le reste reste externe.
  noExternal: [/^@liveplace\//],
  // `redis-core` lit `restore.lua` à côté de lui : une fois empaqueté, c'est `dist/` (JOURNAL 2026-10-08).
  onSuccess: async () => cpSync("../../packages/redis-core/src/restore.lua", "dist/restore.lua"),
});

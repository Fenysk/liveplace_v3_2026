import { cpSync, readdirSync } from "node:fs";
import { defineConfig } from "tsup";

const REDIS_CORE_SOURCE = "../../packages/redis-core/src";

export default defineConfig({
  entry: { main: "src/app/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  // Les packages du dépôt n'ont pas d'étape de build : ils entrent dans le bundle, le reste reste externe.
  noExternal: [/^@liveplace\//],
  // `redis-core` lit ses scripts à côté de lui : une fois empaqueté, c'est `dist/` (JOURNAL 2026-09-19).
  onSuccess: async () => {
    for (const script of readdirSync(REDIS_CORE_SOURCE).filter((name) => name.endsWith(".lua"))) {
      cpSync(`${REDIS_CORE_SOURCE}/${script}`, `dist/${script}`);
    }
  },
});

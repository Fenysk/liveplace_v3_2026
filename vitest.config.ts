import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageSrc = (name: string) => fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@liveplace/protocol": packageSrc("protocol"),
      "@liveplace/domain": packageSrc("domain"),
      "@liveplace/redis-core": packageSrc("redis-core"),
      "@liveplace/durable": packageSrc("durable"),
      "@liveplace/shared": packageSrc("shared"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
    // Un Redis jetable par lancement, démarré dans Docker (JOURNAL 2026-10-11).
    globalSetup: ["./packages/redis-core/src/test-global-setup.ts"],
    // Deux gates à la fois saturent la machine : Docker se fige alors plusieurs secondes et les tests dépassent leur délai (JOURNAL 2026-10-11).
    maxWorkers: "50%",
    // Vitest vide les CSS importés : les jetons restent lisibles, le manifest y lit le fond du jeu (`?raw`).
    css: { include: [/design\/tokens\.css/] },
  },
});

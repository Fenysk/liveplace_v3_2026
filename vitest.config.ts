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
  },
});

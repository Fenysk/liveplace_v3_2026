import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const packageSource = (name: string) => `${import.meta.dirname}/../../packages/${name}/src`;

export default defineConfig({
  resolve: {
    alias: {
      "@liveplace/protocol": packageSource("protocol"),
      "@liveplace/domain": packageSource("domain"),
      "@liveplace/redis-core": packageSource("redis-core"),
      "@liveplace/durable": packageSource("durable"),
      "@liveplace/shared": packageSource("shared"),
    },
  },
  // En dev, le gateway tourne à part : `/ws` reste sur l'origine de la page, comme en production.
  server: { proxy: { "/ws": { target: "ws://127.0.0.1:8080", ws: true } } },
  plugins: [
    // Le routeur et l'arbre généré vivent dans `app/`, la seule couche qui voit `routes/` et le reste.
    tanstackStart({
      start: { entry: "app/start.ts" },
      router: { entry: "app/router.tsx", generatedRouteTree: "app/routeTree.gen.ts" },
    }),
    nitro({ plugins: ["./src/app/boot.ts"] }),
    viteReact(),
  ],
});

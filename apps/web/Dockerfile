# L'image du web (§11.4) : TanStack Start, servi par le serveur Node que produit Nitro.
# docker build -f apps/web/Dockerfile .

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
RUN npm install --global pnpm@11.17.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @liveplace/web build

# `.output/` se suffit : Nitro y a déjà mis le serveur et ses dépendances.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# Built from the repo root: fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
FROM node:26-alpine AS build
RUN npm install -g pnpm@11.1.3
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @twinion-bingo/api...
COPY apps/api apps/api
RUN pnpm --filter @twinion-bingo/api build
# CI=true: non-interactive, so pnpm may prune node_modules down to prod deps.
RUN CI=true pnpm install --frozen-lockfile --prod --filter @twinion-bingo/api...

FROM node:26-alpine
WORKDIR /repo/apps/api
ENV NODE_ENV=production PORT=8080
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]

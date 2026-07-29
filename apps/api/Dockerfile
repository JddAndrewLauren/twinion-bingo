# Built with the repo root as the context: fly deploy . --config apps/api/fly.toml
# Do NOT add --dockerfile; that path resolves relative to fly.toml's own directory.
FROM node:26-alpine AS build
# Not `corepack enable`: node:26-alpine ships no corepack. Keep this version in
# step with `packageManager` in the root package.json — the two can drift.
RUN npm install -g pnpm@11.1.3
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The API depends on @twinion-bingo/theme, so its manifest has to be here before
# the install or the workspace link cannot be satisfied.
COPY apps/api/package.json apps/api/
COPY packages/theme/package.json packages/theme/
RUN pnpm install --frozen-lockfile --filter @twinion-bingo/api...
COPY packages/theme packages/theme
COPY apps/api apps/api
# The theme package ships emitted JS, not its sources, so it builds first.
RUN pnpm --filter @twinion-bingo/theme build
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
# The workspace link in apps/api/node_modules points here, and `exports` resolves
# to dist/ — so the emitted package, not its sources, is what the image needs.
COPY --from=build /repo/packages/theme/package.json /repo/packages/theme/package.json
COPY --from=build /repo/packages/theme/dist /repo/packages/theme/dist
# Decks are drawn from the committed pools, which live outside any package.
COPY themes /repo/themes
EXPOSE 8080
# The image ships a `node` user; nothing here needs root, and PORT is above 1024.
USER node
CMD ["node", "dist/server.js"]

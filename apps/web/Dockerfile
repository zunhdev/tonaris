# syntax=docker/dockerfile:1
# tonaris-web (TS-01, TS-110): the built Start app and its Bun server (apps/web/server.ts), with no node_modules:
# the server build bundles its dependencies (vite.config.ts). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t tonaris-web .
#   docker run -e API_URL=https://api.tonaris.example tonaris-web
#   pre-deploy: wait for the API (TS-01)    docker run -e API_URL=… tonaris-web bun wait-for-api.ts
# API_URL is read at start-up, so one image serves any host.

FROM oven/bun:1.4.3 AS build
WORKDIR /repo
# Every workspace manifest, so the frozen lockfile matches; then the web app's dependencies, build tools included.
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/providers/package.json packages/providers/
COPY packages/ui/package.json packages/ui/
COPY tooling/package.json tooling/
RUN bun install --frozen-lockfile --filter @tonaris/web
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
# The pure link parser, `@tonaris/providers/links` (TS-02, TS-40).
COPY packages/providers packages/providers
COPY packages/ui packages/ui
COPY apps/web apps/web
RUN bun run --cwd apps/web build

FROM oven/bun:1.4.3-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=bun:bun /repo/apps/web/dist ./dist
COPY --from=build --chown=bun:bun /repo/apps/web/server.ts /repo/apps/web/wait-for-api.ts ./
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "server.ts"]

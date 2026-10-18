# syntax=docker/dockerfile:1
# tonaris-api (TS-01, TS-110): the API bundled into single files (apps/api/build.ts) on Bun, with no node_modules.
# Build from the repository root:   docker build -f apps/api/Dockerfile -t tonaris-api .
#   service (default)                docker run tonaris-api
#   pre-deploy migration (TS-17)     docker run tonaris-api bun bin/migrate.js
#   creator bootstrap (TS-71)        docker run -e CREATOR_EMAIL=… tonaris-api bun bin/seed-creator.js
# Settings come from the environment (.env.example); production refuses to start without its secrets.

FROM oven/bun:1.4.3 AS build
WORKDIR /repo
# Every workspace manifest, so the frozen lockfile matches; then the API's runtime dependencies only.
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/providers/package.json packages/providers/
COPY packages/ui/package.json packages/ui/
COPY tooling/package.json tooling/
RUN bun install --frozen-lockfile --production --filter @tonaris/api
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY packages/domain packages/domain
COPY packages/providers packages/providers
COPY apps/api apps/api
RUN bun run --cwd apps/api build

FROM oven/bun:1.4.3-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build --chown=bun:bun /repo/apps/api/dist ./
USER bun
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "bin/server.js"]

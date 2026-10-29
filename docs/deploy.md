# Deploying Tonaris

How to run Tonaris in production on any host that meets the platform requirements (tech spec TS-110). The creator chooses the host; nothing here assumes a particular one.

## What a host must provide

- **Two services:** `tonaris-web` and `tonaris-api` (TS-01), each on its own hostname with TLS. The web app runs at the apex, `https://tonaris.<tld>`, and the API at `https://api.tonaris.<tld>`. The API's host must be a subdomain of the web app's host, because the session cookie is scoped to the web app's host (TS-08).
- **Postgres 18** with `pg_trgm`. Only the API connects to it.
- **Long-lived streaming responses** for the API (server-sent events, TS-23), with no proxy buffering.
- **A pre-deploy step** that runs a command before the new version starts.
- **Health checks** over HTTP: `GET /healthz` answers `200 ok` on both services.
- **Environment secrets** (TS-105).
- **A scheduler** for the nightly backup (TS-112), once it exists.

## Two ways to run it

**Docker images** (the portable path, Q-08). Build them from the repository root:

```sh
docker build -f apps/api/Dockerfile -t tonaris-api .
docker build -f apps/web/Dockerfile -t tonaris-web .
```

Both use `oven/bun:1.4.3-slim` and run as the unprivileged `bun` user. Each declares a health check on `/healthz`. Neither contains `node_modules`: the API is bundled into single files, and the web server build carries its dependencies. CI builds and smoke-tests both images (`.github/workflows/images.yml`).

**Bun directly** (no containers), with Bun 1.4.3 installed:

```sh
bun install --frozen-lockfile
bun run build                          # apps/api/dist and apps/web/dist
bun apps/api/dist/bin/migrate.js       # pre-deploy
bun apps/api/dist/bin/seed-creator.js  # pre-deploy
bun apps/api/dist/bin/server.js        # tonaris-api
bun apps/web/server.ts                 # tonaris-web
```

The steps below give the image commands. Without Docker, run the same file with `bun`.

## Settings

Set these as environment secrets; `.env.example` lists every setting. In production, both services refuse to start without their required settings.

| Service | Setting | Value |
| --- | --- | --- |
| api | `DATABASE_URL` | The Postgres connection string |
| api | `API_ORIGIN` | `https://api.tonaris.<tld>` |
| api | `WEB_ORIGIN` | `https://tonaris.<tld>` |
| api | `BETTER_AUTH_SECRET` | At least 32 random bytes, e.g. `openssl rand -hex 32`. It also derives share links' tokens (TS-32): changing it signs everyone out **and breaks every share link**, which owners then turn off and on again for new ones. |
| api | `SMTP_URL`, `EMAIL_FROM` | The mail provider's SMTP URL and the sender, such as `Tonaris <no-reply@tonaris.<tld>>` |
| api | `CLIENT_IP_HEADER` | The header the host's proxy puts the client address in, e.g. `X-Forwarded-For`. Without it, the per-IP sign-in limit sees only the proxy's address (TS-104). |
| api | `CREATOR_EMAIL` | The creator's address, read by the creator bootstrap |
| web | `API_URL` | `https://api.tonaris.<tld>`, read at start-up and given to browsers |
| web | `API_INTERNAL_URL` | Optional: the API over the host's private network, for the server's own reads, such as guest pages (TS-03). Without it, the server uses `API_URL`. |
| both | `PORT` | Optional: 3001 for the API, 3000 for the web app |

The images set `NODE_ENV=production`. When running Bun directly, set it yourself.

## Each deploy

1. **Migrate** (the pre-deploy step). Pending migrations run in one transaction, so a failure leaves the schema as it was and the old version keeps running:

   ```sh
   docker run --rm --env-file api.env tonaris-api bun bin/migrate.js
   ```

2. **Bootstrap the creator** (also pre-deploy). The first deploy creates the creator's account from `CREATOR_EMAIL`. Later runs report that it exists and change nothing, so this step can stay in every deploy:

   ```sh
   docker run --rm --env-file api.env tonaris-api bun bin/seed-creator.js
   ```

3. **Start the API**, and wait until `/healthz` answers. The API always deploys before the web app (TS-01). Changes within `/v1` are additive, so the web app still running works with the newer API.
4. **Start the web app** with `API_URL` set.
5. **Check** that `https://api.tonaris.<tld>/v1/health` answers `{"status":"ok"}` and that `https://tonaris.<tld>/sign-in` loads. To check email, sign in as the creator.

## Things to get right on the host

- **Don't cache HTML at a CDN.** Each page carries its own CSP nonce (TS-101). Files under `/assets/` are fingerprinted and safe to cache for good.
- **Don't add or override security headers** in a proxy. Both services set their own CSP, HSTS and `X-Content-Type-Options` (TS-101).
- **The API needs no CORS configuration at the proxy.** It allows credentialed requests from `WEB_ORIGIN` only (TS-102).
- **No staging environment** for now. A future one needs a separate registrable domain, so production cookies never reach it (TS-08).

## Rolling back

- **The code:** deploy the previous images. A rollback across a migration needs that migration's changes to be compatible with the older code. Migrations follow expand/contract for that reason (TS-17).
- **Migrations:** they are never edited once merged. Fix forward with a new one.

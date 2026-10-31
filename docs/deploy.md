# Deploying Tonaris

Tonaris runs on [Render](https://render.com) in Frankfurt, behind [Cloudflare](https://www.cloudflare.com). The creator chose this on 30 October 2026 (TON-108, TS-111). `render.yaml` at the repository root is the Render side, a [Blueprint](https://render.com/docs/infrastructure-as-code); this guide sets everything up once. After that, every merge to `main` deploys itself.

## What runs where

| Piece | Where |
| --- | --- |
| `tonaris-api` | Render web service, `0.5c-512mb`, at `https://api.tonaris.app` |
| `tonaris-web` | Render web service, `0.5c-512mb`, at `https://tonaris.app` (Render adds `www`, which redirects) |
| `tonaris-db` | Render Postgres 18, `0.1c-256mb`, 1 GB disk that grows by itself. Only the two services reach it, over Render's private network. |
| Backups | Render Postgres's point-in-time recovery: any moment of the last 3 days on Render's Hobby plan, 7 on Pro (TS-112). Restoring: [`runbooks/restore.md`](runbooks/restore.md). |
| Revocation ledger | Cloudflare R2 bucket `tonaris-ledger`, write-once for 30 days (TS-113) |
| DNS, TLS and the cover-art cache | Cloudflare's Free plan, in front of both hostnames |
| Email | Resend, from `mail.tonaris.app` ([Email](#email)) |
| Domain | `tonaris.app`, registered at Spaceship |

Render's Hobby workspace is enough to start. Pro adds 7 days of recovery and more included bandwidth.

## Once: the setup

You need accounts at Render and Cloudflare, each with a payment method. R2 asks for one even within its free allowance. You also need the Resend account (see [Email](#email)) and Spaceship, where the domain is registered.

### 1. Move `tonaris.app`'s DNS to Cloudflare

Cloudflare can only proxy and cache a domain whose DNS it answers for. The domain stays registered at Spaceship.

1. At [Spaceship](https://www.spaceship.com/application/domain-list-application/), open `tonaris.app`. If DNSSEC is on, turn it off first: a domain with DNSSEC can't move to new nameservers safely.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com), go to **Domains** → **Onboard a domain**. Enter `tonaris.app`, keep the quick scan for DNS records, select **Continue**, and pick the **Free** plan.
3. Review the records the scan found:
   - **Keep Resend's four** (they send the sign-in codes):
     - `TXT` `resend._domainkey.mail`;
     - `MX` `send.mail` and `TXT` `send.mail` (SPF);
     - `TXT` `_dmarc`.
     
     Compare them with Resend's [Domains](https://resend.com/domains) page and add any that are missing. `MX` and `TXT` records are always **DNS only**.
   - **Delete** any `A`, `AAAA` or `CNAME` record for `tonaris.app` or `www`: Spaceship's parking page. Step 4 adds the real ones.
   - Select **Continue**.
4. Cloudflare shows two nameservers. At Spaceship, open `tonaris.app` → **Nameservers** → **Change** → **Custom nameservers**. Enter both, save, and confirm **Yes, change to Custom DNS**.
5. Wait for Cloudflare's email saying `tonaris.app` is active. It usually takes minutes but can take up to a day. Then check that Resend's [Domains](https://resend.com/domains) page still shows `mail.tonaris.app` as **Verified**.

### 2. The ledger's bucket on Cloudflare R2

The API writes every deletion-class event here as it happens: account deletions, revoked links, grants and AI connections, and purged Trash. Restoring a backup rewinds the database, and replaying these events keeps what was deleted deleted (TS-113). The bucket sits outside Render on purpose, so a restore always finds it.

1. In the Cloudflare dashboard, open **R2 object storage**. The first time, follow the prompt to enable R2.
2. **Create bucket**:
   - **Bucket name:** `tonaris-ledger`.
   - **Location:** Automatic, with the location hint **Western Europe (WEUR)**, near Frankfurt.
   - Leave the rest as it is, then **Create bucket**.
3. Make it write-once. In the bucket, go to **Settings** → **Bucket lock rules** → **Add rule**:
   - **Name:** `write-once`.
   - **Prefix:** `events/`.
   - **Retention:** 30 days.
   - **Save changes.** For 30 days nobody can delete or overwrite an event, not even with the API's key. Render's recovery window is at most 7 days.
4. The API's key. Go to **R2 object storage** → **Overview** → **Account Details** → **API Tokens** → **Manage** → **Create Account API token**:
   - **Token name:** `tonaris-api-ledger`.
   - **Permissions:** **Object Read & Write**, applied to the specific bucket `tonaris-ledger` only.
   - **Create Account API token.** Copy the **Access Key ID**, the **Secret Access Key** and the S3 endpoint, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. The secret is shown once.

### 3. Render: the Blueprint

1. Sign in to the [Render Dashboard](https://dashboard.render.com) with GitHub, so Render can see `zunhdev/tonaris`. Add a card under your workspace's **Billing**.
2. **New** → **Blueprint**. Select **Connect** next to `zunhdev/tonaris`; if it isn't listed, give Render's GitHub app access to it first. Name it `tonaris`, keep the branch `main`, and leave the Blueprint path as `render.yaml`.
3. Render asks for the values that `render.yaml` leaves out (`sync: false`):

   | Setting | Service | Value |
   | --- | --- | --- |
   | `CREATOR_EMAIL` | api | Your address. The first deploy creates the creator's account with it (TS-71). |
   | `SUPPORT_EMAIL` | api | A mailbox you read, shown on `/help/recovery` (TS-73) |
   | `RESEND_API_KEY` | api | The production key ([Email](#email)) |
   | `S3_ENDPOINT` | api | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, from step 2 |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | api | From step 2 |
   | `SENTRY_DSN` | api, web | Each project's DSN ([monitoring](runbooks/monitoring.md)), or leave empty |
   | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | api | The Spotify app's, as in your local `.env`, or leave empty: Spotify links then use MusicBrainz alone |
   | `YOUTUBE_API_KEY` | api | A YouTube Data API v3 key from the Google account used only for Tonaris ([YouTube Music](#youtube-music)), or leave empty: YouTube Music links then use MusicBrainz alone |

   Everything else is in `render.yaml`. `BETTER_AUTH_SECRET` is generated once and kept; changing it signs everyone out and breaks every share link.
4. Select **Deploy Blueprint**. Render creates `tonaris-db`, then builds both services from their Dockerfiles. This takes about 5–10 minutes:
   - **The API** runs the migrations and creates the creator before it starts.
   - **The web app** logs `Waiting for the API … to run <commit>` until the API is live, then deploys (TS-01).
5. Note each service's own address, shown under its name: `tonaris-api….onrender.com` and `tonaris-web….onrender.com`. Render adds a suffix if the name was taken. You need them in step 4.

### 4. The domains

The Blueprint has already added `api.tonaris.app` and `tonaris.app` (and `www`) to the services. Now point them at Render:

1. In Cloudflare, open `tonaris.app` → **DNS** → **Records** → **Add record**, three times, each **DNS only** for now. While a record is proxied, Render can't verify the domain or issue its certificate.

   | Type | Name | Target |
   | --- | --- | --- |
   | `CNAME` | `@` | `tonaris-web….onrender.com` |
   | `CNAME` | `www` | `tonaris-web….onrender.com` |
   | `CNAME` | `api` | `tonaris-api….onrender.com` |

2. In Render, open each service → **Settings** → **Custom Domains**, and select **Verify** next to each domain. Wait until each shows its certificate as issued.
3. Back in Cloudflare, switch all three records to **Proxied**.
4. In Render, open each service → **Settings** → **Custom Domains**, and set **Render Subdomain** to **Disabled**. Now nothing reaches the services except through Cloudflare. That's also what makes `CLIENT_IP_HEADER=CF-Connecting-IP` trustworthy for the sign-in limits (TS-104).

### 5. Cloudflare's settings

All of these are under `tonaris.app` in the Cloudflare dashboard.

1. **SSL/TLS** → **Overview** → **Configure** → **Custom SSL/TLS** → **Full (strict)**. Render's certificates are valid, so Cloudflare checks them.
2. **Caching** → **Cache Rules** → **Create rule**:
   - **Rule name:** `Cover art`.
   - **When incoming requests match:** **Custom filter expression**:
     - **Hostname** equals `api.tonaris.app`;
     - **And** **URI Path** starts with `/img/`.
   - **Then:** **Eligible for cache**. Leave the TTLs as they are: the proxy's `Cache-Control: public, max-age=604800, immutable` decides (TS-103).
   - **Deploy.**

   Cover art then leaves Render once per image, not once per visitor. Render's plans include little outbound bandwidth.
3. **Security** → **Settings**:
   - **Email Address Obfuscation:** **Off** (filter by **Client-side abuse**). It's on by default and injects a script into pages that show an address, such as `/help/recovery`, and the CSP refuses that script (TS-101).
   - **Bot fight mode:** **Off** (filter by **Bot traffic**). It challenges automated traffic, and AI clients connecting over MCP can't answer a challenge.
   - **Configure AI bot policies:** set **Agent** to **Allow (do not block)**. AI assistants acting for their user, as MCP clients do, fall under it.

### 6. Check it

1. `https://api.tonaris.app/v1/health` answers `{"status":"ok","commit":"…"}`, naming the latest commit on `main`.
2. `https://tonaris.app/sign-in` loads. Sign in as the creator; the code arrives from `no-reply@mail.tonaris.app`.
3. Open an album with cover art, then reload. In the browser's network tools, the `/img/…` response carries `cf-cache-status: HIT`.
4. In Tonaris, create a share link and revoke it. In R2, `tonaris-ledger` now holds an object under `events/`, and Admin → Operations lists no failed `ledger.append` job.
5. Render → `tonaris-db` → **Recovery** shows **Point-in-Time Recovery** available.

## Each deploy

Merging to `main` is the deploy:

1. CI's checks run on `main`. Render waits for them (`autoDeployTrigger: checksPass`) and deploys nothing if one fails.
2. **The API**:
   - Render builds its image.
   - The pre-deploy step, `bin/predeploy.js`, runs `bin/migrate.js`, then `bin/seed-creator.js` (TS-17, TS-71). Pending migrations apply in one transaction, so a failure leaves the schema as it was, and the old version keeps running.
   - The new instance starts, passes `/healthz`, and takes over.
3. **The web app** builds at the same time. Its pre-deploy step, `wait-for-api.ts`, waits until the API's `/v1/health` names the same commit, then the web app takes over. If the API doesn't get there within 20 minutes, the web deploy fails and the running version stays.
   - Every five seconds it asks over the private network, and then at `https://api.tonaris.app` if the private address doesn't name the commit yet. Either one naming it is enough.
   - Each question opens a new connection (TON-113). On 30 October 2026, one wait kept hearing the API instance that was running when it started. It heard the old commit, then nothing once that instance stopped, while the new API had been live for minutes. A manual redeploy of the web app got through at once.

To redeploy by hand, open the service → **Manual Deploy** → **Deploy latest commit**. Deploy the API first.

## Settings

`render.yaml` sets these; `.env.example` describes each one. In production, both services refuse to start without their required settings.

| Service | Setting | Value |
| --- | --- | --- |
| api | `DATABASE_URL` | `tonaris-db`'s internal connection string |
| api | `API_ORIGIN`, `WEB_ORIGIN` | `https://api.tonaris.app`, `https://tonaris.app`. The API's host must be a subdomain of the web app's (TS-08). |
| api | `BETTER_AUTH_SECRET` | Generated once by Render. It also derives share links' tokens (TS-32): changing it signs everyone out **and breaks every share link**, which owners then turn off and on again for new ones. |
| api | `RESEND_API_KEY`, `EMAIL_FROM` | Resend's key, and `Tonaris <no-reply@mail.tonaris.app>` |
| api | `SUPPORT_EMAIL`, `CREATOR_EMAIL` | Asked for when the Blueprint is created |
| api | `CLIENT_IP_HEADER` | `CF-Connecting-IP`: the visitor's address, which Cloudflare sets (TS-104) |
| api | `LEDGER_URL`, `S3_*` | `s3://tonaris-ledger/events`, with R2's endpoint, key and region `auto` (TS-113) |
| api, web | `PORT` | 3001 and 3000 |
| web | `API_URL` | `https://api.tonaris.app`, read at start-up and given to browsers |
| web | `API_INTERNAL_URL` | The API's private-network `host:port`, for the server's own reads, such as guest pages (TS-03) |

To change one later, open the service → **Environment**. A change to a value that `render.yaml` sets belongs in `render.yaml`: the next Blueprint sync overwrites a dashboard edit.

## Email

Tonaris sends email through [Resend](https://resend.com) (TS-72): sign-in and join codes, sharing and admission invitations, email changes and recovery. Each email is queued and retried (TS-90), so a slow or failed send never fails a request.

**Once, before the first deploy:**

1. **The domain:** in Resend's [Domains](https://resend.com/domains), `mail.tonaris.app` is added in the Ireland (`eu-west-1`) region, and its DNS records are set:
   - a DKIM `TXT` at `resend._domainkey.mail`;
   - an `MX` and an SPF `TXT` at `send.mail`.

   `tonaris.app` also has a `_dmarc` `TXT`: `v=DMARC1; p=none;`. Since step 1, these records live in Cloudflare's DNS, no longer at Spaceship. The domain shows **Verified**.
2. **The key:** in [API keys](https://resend.com/api-keys), create a key named for production, with **Sending access** for `mail.tonaris.app` only. It becomes `RESEND_API_KEY`. Resend shows a key once; a lost one is replaced, not recovered.

**To check it** after a deploy, sign in as the creator: the code arrives from `no-reply@mail.tonaris.app`. Resend's [Emails](https://resend.com/emails) page lists each email and whether it was delivered.

**Limits:** Resend's free plan sends 3,000 emails a month, at most 100 a day. Past that, Resend refuses, and Tonaris records the email as failed. An invitation's owner can send it again from its sharing dialog.

## YouTube Music

YouTube Music links are identified by MusicBrainz and, with `YOUTUBE_API_KEY`, by hints from the YouTube Data API (TS-41). The key belongs to a **Google account used only for Tonaris**, never a personal one: enforcement over API use would then reach only Tonaris (TS-105). Tonaris's is `dev@tonaris.app`, a Google account made with that address instead of Gmail; Cloudflare Email Routing forwards the address to the creator's inbox.

**Once, signed in to that account in its own browser profile:**

1. In the [Google Cloud console](https://console.cloud.google.com), create a project, such as `tonaris`. YouTube's API needs no billing account.
2. In **APIs & Services** → **Library**, open **YouTube Data API v3** and select **Enable**.
3. In **APIs & Services** → **Credentials**, select **Create credentials** → **API key**. Under API restrictions, choose **YouTube Data API v3**, then create it. The key becomes `YOUTUBE_API_KEY` on the API service.

**To check it** after a deploy, add a YouTube Music album link that MusicBrainz doesn't know by URL: it's identified instead of asking for details. The [API's metrics](https://console.cloud.google.com/apis/api/youtube.googleapis.com/metrics) show the reads.

**Limits:** 10,000 units a day; each link takes 3, so about 3,300 links a day. Past that, or with a key that stops working, the API logs "The YouTube Data API refused a read" and YouTube Music links ask for details until the quota resets at midnight Pacific time. More quota needs YouTube's audit.

## Things to get right

- **Don't cache HTML at Cloudflare.** Each page carries its own CSP nonce (TS-101). Cloudflare doesn't cache HTML unless a rule tells it to. Files under `/assets/` are fingerprinted and cached by default; `/img/` is cached by the rule in step 5.
- **Don't let Cloudflare change pages.** Email Address Obfuscation, Rocket Loader, Web Analytics' automatic setup and similar features inject scripts, which the CSP refuses.
- **Don't add or override security headers** at Cloudflare. Both services set their own CSP, HSTS and `X-Content-Type-Options` (TS-101).
- **The API needs no CORS configuration at Cloudflare.** It allows credentialed requests from `WEB_ORIGIN` only (TS-102).
- **The change stream stays open** through Cloudflare: the API sends a keepalive comment every 20 seconds (TS-23), well inside Cloudflare's 100-second idle limit.
- **One API instance.** Sign-in limits and rate counters live in the API's memory (TS-104), so the API isn't scaled out to more instances.
- **No staging environment** for now. A future one needs a separate registrable domain, so production cookies never reach it (TS-08).

## Rolling back

- **The code:** in Render, open the service → **Events**, pick an earlier successful deploy, and select **Rollback**. Roll back the web app first, then the API, so the web app never runs ahead of the API. Then revert the change on `main`, or the next merge deploys it again.
- **Across a migration:** a rollback needs that migration's changes to be compatible with the older code. Migrations follow expand/contract for that reason (TS-17). They are never edited once merged; fix forward with a new one.
- **The data:** see [`runbooks/restore.md`](runbooks/restore.md).

## Other hosts

TS-110 lists what any host must provide. The Docker images build anywhere from the repository root:

```sh
docker build -f apps/api/Dockerfile -t tonaris-api .
docker build -f apps/web/Dockerfile -t tonaris-web .
```

Both use `oven/bun:1.4.3-slim`, run as the unprivileged `bun` user, and declare a health check on `/healthz`. Neither contains `node_modules`. CI builds and smoke-tests both (`.github/workflows/images.yml`). Without Docker, with Bun 1.4.3 installed:

```sh
bun install --frozen-lockfile
bun run build                          # apps/api/dist and apps/web/dist
bun apps/api/dist/bin/predeploy.js     # pre-deploy: migrate.js, then seed-creator.js
bun apps/api/dist/bin/server.js        # tonaris-api
bun apps/web/server.ts                 # tonaris-web
```

Set `NODE_ENV=production` when running Bun directly; the images set it. Another host also needs its own backups, and a way to wait for the API before the web app deploys (`apps/web/wait-for-api.ts` with `GIT_COMMIT`).

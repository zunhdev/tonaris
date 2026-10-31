# Tasks

## 1. YouTube Music

- [x] 1.1 Domain: `youtube-music` in `streamingServices`, after Tidal, named "YouTube Music"
- [x] 1.2 Providers: parse YouTube Music links; step 2's URL forms; the Data API client; the track-count check; the chain, with `mayReadYouTube`
- [x] 1.3 Database: the services' checks widened, with a migration
- [x] 1.4 API: `YOUTUBE_API_KEY` in config and wiring; capture's context; provider names; MCP's description; the OpenAPI document and oasdiff exceptions
- [x] 1.5 Web: link detection, opening the page, copy that lists the services, New album's label

## 2. Terms and privacy

- [x] 2.1 Domain: `termsVersion`; `termsAgreed` on the account
- [x] 2.2 Database: `user.terms_version` and `terms_agreed_at`, with a migration; join records agreement
- [x] 2.3 API: Better Auth's fields, the session's account, `POST /v1/me/terms`
- [x] 2.4 Web: `/terms` and `/privacy`; links from the sign-in frame, shared pages and the account menu; the join line; the one-time screen

## 3. Tests, docs and deploy

- [x] 3.1 Unit tests: parsing, forms, the Data API client, the track-count rule, the chain, config, agreement
- [x] 3.2 Browser tests: a YouTube Music capture and its link opening; the terms pages, the join line and the one-time screen
- [x] 3.3 PRD, DS and TS as built; `.env.example`, `render.yaml`, `docs/deploy.md`
- [x] 3.4 Run `bun run check`

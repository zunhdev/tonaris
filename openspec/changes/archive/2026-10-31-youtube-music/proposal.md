# Proposal

Linear: TON-131 (Feature). Implements FR-02.1–FR-02.3, FR-06.2–FR-06.6. Design: DS-21, DS-22, DS-25, DS-46. Tech: TS-40, TS-41, TS-43, TS-105. Done when a YouTube Music link can be captured, identified as TS-41 says, saved, edited and opened, with terms of use and a privacy notice members agree to.

## Why

In the creator's manual testing (31 October 2026), the creator asked for YouTube Music albums. The TON-128 spike settled the path: MusicBrainz's URL lookup, then transient hints from the YouTube Data API, never YouTube's pages. YouTube's Developer Policies (III.A) require terms of use that bind users to YouTube's Terms of Service, and a privacy notice users agree to that says the app uses YouTube API Services. Tonaris has neither, and the creator chose to build both here (31 October 2026).

## What Changes

- **YouTube Music is a fifth service**, after Tidal: its album links (`/playlist?list=OLAK5uy_…`) and tracks in an album (`/watch?v=…&list=OLAK5uy_…`) on `music.youtube.com`, `www.`, `m.` and bare `youtube.com` are read, canonical as `https://music.youtube.com/playlist?list={id}`. Other playlists, a video alone and `/browse/MPREb_…` are explained.
- **Identification:** step 2 asks MusicBrainz for three URL forms; step 4 makes three Data API reads with `YOUTUBE_API_KEY` and runs step 4's rule plus a track-count check. Nothing from YouTube is stored, logged or cached; agents' captures use it too. Without the key, or for a member who hasn't agreed to the terms, step 4 is skipped.
- **Links:** saved, edited, listed, exported and opened like the others. YouTube Music has no desktop app, so its links open the page whatever the setting.
- **Terms and privacy:** public pages `/terms` and `/privacy`, linked from the sign-in pages, shared pages and the account menu. Joining says "By continuing, you agree to…"; members who joined before see a one-time screen. The account records the version agreed to. The privacy notice names zunh.dev as the operator (the creator chose this, 31 October 2026).
- **API:** `youtube-music` joins the service enums; `GET /v1/me` gains `termsAgreed`, and `POST /v1/me/terms` records agreement. The three mutations whose request schemas list services get one-time oasdiff exceptions (the creator approved, 31 October 2026).

## Capabilities

### New Capabilities

- `terms-and-privacy`: public terms of use and privacy notice, and members' agreement to them.

### Modified Capabilities

- `link-capture`: YouTube Music links are read and identified.
- `metadata-sources`: the YouTube Data API's reads and what's kept of them.
- `service-links`: YouTube Music links are saved and opened.

## Impact

- **`packages/domain`:** the service list, terms version, account schema.
- **`packages/providers`:** link parsing and forms, a YouTube Data API client, the track-count check, the identification chain.
- **`packages/db`:** the services' checks, the user's agreed terms version, migrations.
- **`apps/api`:** config, wiring, capture's context, `/v1/me/terms`, join records agreement, the OpenAPI document and oasdiff exceptions, MCP's description.
- **`apps/web`:** link detection, opening, copy that lists services, `/terms`, `/privacy`, the join line and the one-time screen.
- **Docs and deploy:** PRD, DS, TS as built; `.env.example`, `render.yaml`, `docs/deploy.md`.

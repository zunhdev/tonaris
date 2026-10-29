# Proposal

Linear: TON-70 (Feature). Implements FR-07.11, FR-11.9 and FR-12.1 for guests, with FR-06.5's service chooser. Design: DS-72. Tech: TS-03, TS-23, TS-32. Done when AC-26 passes and mobile LCP is within the provisional target (2.5 s).

## Why

TON-65's links point at `/s/{token}`, which shows nothing yet. Anyone with a link must be able to browse what it shares, live, without an account. Their presentation choices last the visit, and the token must never leak.

## What Changes

- **`GET /v1/s/{token}`,** no session: the link's root as its guests see it, from TON-64's `sharedSnapshot()`, with artwork signed (TS-103). An unknown, revoked or suspended link answers 404, "This link isn't available. Ask the person who shared it for a new one.", whatever the reason.
- **`GET /v1/s/{token}/stream`:** server-sent `shared-invalidate {rootId}` events whenever the owner's saved content or sharing changes (TS-23), so the page re-reads.
  - **The hub:** a guest stream watches the owner's account. Every confirmed owner write notifies it, including sharing writes and the display name, which log no change.
- **Tokens stay out of logs:** the API's error log shows `/v1/s/…` paths with the token replaced (TS-32).
- **`/s/{token}`,** server-rendered (DS-72), public, `Referrer-Policy: no-referrer` (already set):
  - **Header:** the Tonaris wordmark, the container's name, "Shared by {name}", and its description.
  - **A folder:** breadcrumbs within the share, and its folders and lists; each opens with `?c={id}`, staying inside the shared subtree.
  - **A list:** its albums as rows or a grid, each with an **Open** chooser of its services. Links open in a new tab with `rel="noopener noreferrer"`.
  - **View options for the visit** (FR-11.9): sort, direction, grouping and layout, with "Your view settings aren't saved — sign in to keep them". They're kept in the tab's session only.
  - **Footer:** "Sign in". No search.
  - **Live:** the stream's events re-read the share, debounced 250 ms. A link that stops working turns into the unavailable sentence.
  - **Link previews** (text-only): `og:title` is the name, and `og:description` "Shared by {name} · {n} albums"; no image.
  - **Narrow screens:** 56px rows with 44px artwork (DS-110).

The signed-in visit's "Add to Shared with me" banner comes with TON-68.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: guests browse shared links live, with presentation for the visit.

## Impact

- **`packages/domain`:** the snapshot's albums carry `artworkSignature`; the stream event schema.
- **`apps/api`:**
  - the routes;
  - the hub's watch and notify;
  - log redaction;
  - OpenAPI: two paths, and an event component.
- **`apps/web`:** the `/s/$token` route, `features/guest/`, and the API's internal URL for server-side loads (`API_INTERNAL_URL`, TS-03).
- **No schema change.**

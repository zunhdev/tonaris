# Design

## Context

- **TON-64:** `findShareLink(token)` and `sharedSnapshot(db, {kind: "link", linkId}, rootId)` give a guest's view of a root. It's undefined when the root is trashed or unreadable.
- **The hub** delivers an account's change log to that account's streams (TS-23). Sharing commands and `account.setDisplayName` log no change.
- **The web app** renders public routes on the server (TS-03). The browser reaches the API through `apiUrl`. No route loads data on the server yet.
- **`Referrer-Policy: no-referrer`** is already sent for `/s/` paths (`security/headers.ts`).

## Goals / Non-Goals

**Goals:**
- the guest API, its stream and the server-rendered page;
- visit-only presentation;
- the service chooser;
- previews;
- the LCP target.

**Non-Goals:**
- the signed-in banner and saving (TON-68);
- signed-in viewers' pages (TON-69);
- per-root deltas: guests re-read the whole share (TS-23 accepts that at this scale).

## Decisions

### 1. The API

- **`GET /v1/s/{token}`:** `findShareLink`, then `sharedSnapshot` for the link's container, with albums' artwork signed. Any miss is the same 404 `not_found` with DS-72's sentence.
- **Navigating inside a share** is done on the client with the one snapshot (`?c=` picks a container within it), so guests make one read per visit and per invalidation.
- **`GET /v1/s/{token}/stream`:**
  - checks the link, then opens an SSE channel that watches the owner's account in the hub;
  - every notification pushes `shared-invalidate` `{rootId}`;
  - keepalives and shutdown are as for owner streams (`eventStream`).
- **The hub:**
  - gains `watch(accountId, listener)` and `notify(accountId)`; `publish` also notifies;
  - the mutation and batch routes call `notify` for a confirmed outcome without changes, which covers sharing and display names.
- **Why the whole account:** narrowing to the root would need TS-31's affected-roots query on every write. A guest re-read of one share is cheap, and the client debounces.

### 2. Log redaction

`problemDetails` logs `path` on a 500. Paths matching `/v1/s/{token}…` are logged as `/v1/s/[token]…`. The problem's `instance` is the requester's own URL and stays as it was.

### 3. The page

- **Route:** `src/routes/s.$token.tsx`. It's public, server-rendered, and validates `?c=` as a UUID.
- **The loader** fetches the snapshot through Eden, from `API_INTERNAL_URL` on the server when set (else `API_URL`), and from `apiUrl` in the browser. A 404 renders the unavailable page.
- **`features/guest/guest-page.tsx`:**
  - the header;
  - breadcrumbs from the root to the current container;
  - container rows;
  - album rows or cards, built from `order.ts`'s sorting, grouping and chronology. They're not virtualized: `content-visibility: auto` lets the browser skip offscreen rows, and SSR sends them all.
- **Open:** a popover per album listing its services. Each is an `<a target="_blank" rel="noopener noreferrer">`.
- **View options:** sort (Year, Name), direction, grouping, layout. They live in `sessionStorage` per token, so a reload in the tab keeps them and a new visit starts from DS-44's defaults.
- **Live:** a `fetch` stream reader, as the owner's client uses, reconnecting with backoff. Each event re-runs the loader after a 250 ms debounce (`router.invalidate()`).
- **Head:** the title, `og:title`, `og:description` and `robots: noindex`, from the loader's data.

### 4. Measurement

Following the project's proportionate measurements:
- one Playwright run with DevTools' mobile preset (Fast 4G, 4× CPU) on a shared list of 200 albums;
- LCP read from `PerformanceObserver`;
- recorded in TS-120's table against the provisional 2.5 s.

## Risks / Trade-offs

- **[Every owner write re-reads every guest page of theirs]** → Debounced in the browser; a share is one query set. Narrowing is a later optimization (TS-23).
- **[A very large shared list renders every row]** → `content-visibility: auto` keeps layout and paint to what's on screen; at most 5,000 albums.

## Migration Plan

None. `API_INTERNAL_URL` is optional; `docs/deploy.md` lists it.

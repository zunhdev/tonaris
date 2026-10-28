# Design

## Context

- **The limits so far** live in `limits.ts` and are checked by commands under the owner's write lock (TS-18). Albums aren't among them yet.
- **Albums are created** by `createAlbum` (`album.create`) and capture's `create` (`album.capture`). Reuse, re-addition (`reactivateAlbum`) and restore (`trash.recover`) never create one.
- **A capture is claimed** in `mutations` before it asks providers, so the table knows every capture received, including those still running.
- **Clients hold** active albums, and album units in Trash.

## Goals / Non-Goals

**Goals:** the album limit, the capture rate, the meter, and the notices; AC-32.

**Non-Goals:**
- MCP's per-grant rates (TON-85);
- export rates (TON-89);
- saved shared references (M7).

## Decisions

### 1. The album limit

- **`maxAlbums = 5_000`.**
- **`hasAlbumSlot(store, ownerId)`** compares `countAlbums` (every album row of the owner) with it.
- **Where it applies:** `createAlbum`, and capture's `create`, just before inserting. A refusal is `albumCapacityProblem()`. Those are the only two places a record is made, so reuse and restore can't be refused.

### 2. The capture rate

- **`maxCapturesPerHour = 100`.**
- **The check:** after claiming, the mutation runner counts `capturesSince` (the account's `album.capture` mutations received in the last hour, this one excepted). At 100 it finishes the mutation as `rate_limited`, without asking providers.
- **Retries:** the outcome is stored, so a retry of the same mutation gets the same answer, and the app's Retry sends a new one.

### 3. The meter (Settings → Data)

- **The count:** `useAlbumUsage()` counts the client's albums and its album units: `{active, trashed, total, limit}`.
- **The line:** "4,812 of 5,000 albums · 37 in Trash", without the Trash part at zero.
- **The meter:** a native `<meter>` for assistive technology, and a visual bar split into active (`accent.solid`) and trashed (`fg.tertiary`).
- **The note:** "Albums in Trash count until they are deleted permanently. Restoring an album reuses its place."
- **The subnav:** "Data" joins after Connections (DS-92).

### 4. The notices (DS-98)

`CapacityNotice` sits under the capture dialog's and manual entry's descriptions:
- **from 95%:** the usage line, quiet;
- **at the limit:** the refusal's words, as an alert;
- **both:** "Open Trash" and "See usage" links.

## Risks / Trade-offs

- **[The client's count]** → It may lag the server by a moment. The server refuses at the limit regardless; the meter is information.

## Migration Plan

No schema change. Existing accounts are well under the limit.

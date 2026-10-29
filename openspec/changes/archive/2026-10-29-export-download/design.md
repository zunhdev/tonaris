# Design

## Context

- TS-80 fixes the endpoint: one REPEATABLE READ snapshot, a streamed ZIP of four files, and 5 exports an hour.
- DS-96 sets the button's states. It says the preparing state "persists in Activity".
- The builder and renderers exist (TON-87, TON-88). The workload's whole export builds in about 200 ms.

## Goals / Non-Goals

**Goals:** a download that works from Settings → Data and the deletion dialog, inside TS-120's 3 s for 5,000 albums.

**Non-Goals:**
- an export job with a signed link, which TS-80 keeps for larger collections;
- an Activity entry for exports.

## Decisions

### 1. Build, then stream

The handler builds the files in memory, then fflate's `Zip` deflates them into the response as a stream. At 5,000 albums the files total about 7 MB, so building first costs little. It also keeps a failed build from sending a broken ZIP, and from counting against the limit.

### 2. fflate for the ZIP

A small, widely used library with no dependencies and a streaming ZIP writer. It's cheaper than a hand-written ZIP format, and needs no native module.

### 3. The limit in memory

A `SlidingWindow` per account, the same one the sign-in limits use. The API runs as one instance (TS-104). The limit is checked before building and counted after, so a failure can be retried at once.

### 4. A store outside the page, not Activity

DS-96 wants the state to survive leaving the page. The export takes well under a second, so a store outside the page does that without an Activity entry. Moving away keeps the state, and the download still starts. The archive stays in the tab for **Download again** until the next export or signing out.

### 5. One button, two places

`ExportButton` is the button with its states. Settings → Data wraps it with the explanation and the included and excluded lists. The deletion dialog wraps it as "Download your data first".

## Risks / Trade-offs

- **Memory:** an export holds a few MB per request, and only five are allowed per account per hour.

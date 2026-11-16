# Proposal

## Why

Services always show in one order: Spotify, Apple Music, Qobuz, Tidal, YouTube Music. Since TON-280 a card shows only the links that fit, then "+N", so someone who mostly uses Tidal finds it hidden on an album with four links. The creator asked on 16 November 2026 to drag the services into their own order in Settings. Linear: TON-282.

## What Changes

- Settings → Preferences → Streaming services lists the services in the person's order, each with a handle: dragging a service moves it, and ⌥↑ and ⌥↓ on its switch move it a place (FR-06.3, DS-49).
- The order is saved to the account and synced, through a new `defaults.setServiceOrder` mutation and a `service_order` column (TS-21).
- Cards' and rows' links, the "Open in…" chooser, the album panel's link fields and New album follow it. It never opens a service by itself (FR-06.5).
- Until a person chooses, and for guests, the services keep their usual order; a service added later goes last.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: a person puts their services in their own order.

// Shared with me on the client (FR-07.13, TON-68): which shared folders and lists the person keeps, from the snapshot
// and the stream, so another device's change shows within the sync target (FR-09.5). Names, owners and availability
// depend on the owners' data and come from `GET /v1/shared` (features/sharing/shared-with-me.tsx). Writes go
// straight to the API from where they're made, not through these.

import type { Reference } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";

export function createReferenceCollection({ engine }: { engine: SyncEngine }) {
  return snapshotCollection<Reference>(
    engine,
    "references",
    (snapshot) => snapshot.references,
    (reference) => reference.containerId,
    (change) => (change.entity === "reference" ? { key: change.id, row: change.data } : undefined),
    {},
  );
}

export type ReferenceCollection = ReturnType<typeof createReferenceCollection>;

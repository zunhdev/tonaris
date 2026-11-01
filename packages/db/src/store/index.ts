// The domain's `CollectionStore` on one transaction (TS-20), one part per aggregate: albums and Trash, fields,
// folders and lists with their entries, personal choices, and accounts and sharing.

import type { CollectionStore } from "@tonaris/domain";

import type { Transaction } from "../client";
import { albumStore } from "./albums";
import { containerStore } from "./containers";
import { fieldStore } from "./fields";
import { sharingStore } from "./sharing";
import { viewStore } from "./views";

/**
 * The domain's store on one transaction. Search and name keys are derived here, so every write keeps them
 * (TS-12), and so is the provenance of a person's album values (TS-15). The hierarchy is walked with recursive
 * CTEs (TS-31), cut off past the depth limit so that even a cycle in damaged data can't run away.
 */
export function collectionStore(tx: Transaction): CollectionStore {
  return {
    ...albumStore(tx),
    ...fieldStore(tx),
    ...containerStore(tx),
    ...viewStore(tx),
    ...sharingStore(tx),
  } satisfies CollectionStore;
}

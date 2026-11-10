-- Who deleted a Trash unit when it wasn't its owner: an editor, for their Undo (FR-07.20, TON-189).
ALTER TABLE "trash_units" ADD COLUMN "deleted_by" uuid;
// The inspector's Custom fields section (DS-46, DS-26; FR-03.7, FR-03.8): the fields the album applies, each a row
// even when empty. Viewing mode shows their values; Editing mode makes them editors, with × to remove a field, which
// clears its value (Undo puts it back), and "+ Add field": the fields the album doesn't use, then "Create field…",
// which defines one and applies it. Unused fields are absent.

import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useSaveState } from "@/features/sync/save-states";
import { useSyncClient } from "@/features/sync/sync-provider";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { fieldValueKey, type Album, type CustomField, type FieldValue } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tonaris/ui/components/dropdown-menu";

import { useCollectionData } from "./data";
import { FieldCreateDialog } from "./field-create-dialog";
import { FieldValueEditor, shownValue } from "./field-editors";

/** A save the save-state layer reports if it fails; a rejection is expected there, not here. */
const sent = (transaction: { isPersisted: { promise: Promise<unknown> } }) => {
  transaction.isPersisted.promise.catch(() => {});
};

/** The album's applied fields, by name, with their values. */
function useAppliedFields(albumId: string): { field: CustomField; row: FieldValue }[] {
  const { fieldsById, valuesByAlbum } = useCollectionData();
  return (valuesByAlbum.get(albumId) ?? [])
    .flatMap((row) => {
      const field = fieldsById.get(row.fieldId);
      return field ? [{ field, row }] : [];
    })
    .toSorted((a, b) => a.field.name.localeCompare(b.field.name));
}

export function CustomFieldsSection({ album, canEdit }: { album: Album; canEdit: boolean }) {
  const applied = useAppliedFields(album.id);
  const { fields } = useCollectionData();
  const client = useSyncClient();
  const announce = useAnnounce();
  const [creating, setCreating] = useState(false);
  const unused = fields.filter((field) => !applied.some((each) => each.field.id === field.id));

  function apply(field: CustomField) {
    if (!client) return;
    sent(client.fieldValues.insert({ albumId: album.id, fieldId: field.id, value: null }));
    announce(`Added ${field.name} to ${album.title}`);
  }

  return (
    <>
      {applied.length === 0 && !canEdit && (
        <p className="text-small text-fg-tertiary">No custom fields.</p>
      )}
      {applied.length > 0 && (
        <dl className="flex flex-col gap-2">
          {applied.map(({ field, row }) => (
            <FieldRow key={field.id} album={album} field={field} row={row} canEdit={canEdit} />
          ))}
        </dl>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="ghost" className="self-start" />}>
            <Plus aria-hidden strokeWidth={1.5} />
            Add field
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {unused.map((field) => (
              <DropdownMenuItem key={field.id} onClick={() => apply(field)}>
                {field.name}
              </DropdownMenuItem>
            ))}
            {unused.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => setCreating(true)}>Create field…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {creating && (
        <FieldCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(fieldId) => {
            // Applied after the field is defined: the outbox sends them in order.
            if (client) {
              sent(client.fieldValues.insert({ albumId: album.id, fieldId, value: null }));
            }
          }}
        />
      )}
    </>
  );
}

function FieldRow({
  album,
  field,
  row,
  canEdit,
}: {
  album: Album;
  field: CustomField;
  row: FieldValue;
  canEdit: boolean;
}) {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const key = fieldValueKey(album.id, field.id);
  const status = useSaveState(key);

  function remove() {
    if (!client) return;
    sent(client.fieldValues.delete(key));
    announce(`Removed ${field.name} from ${album.title}`);
    notify?.undo({
      title: `Removed ${field.name}`,
      onUndo: () => sent(client.fieldValues.insert(row)),
    });
  }

  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="w-28 shrink-0 truncate pt-1.5 text-fg-secondary" title={field.name}>
        {field.name}
      </dt>
      <dd className="flex min-w-0 flex-1 items-start gap-1">
        {canEdit ? (
          <>
            <FieldValueEditor
              field={field}
              value={row.value}
              label={`${field.name} of '${album.title}'`}
              onSave={(value) => {
                if (!client) return;
                sent(
                  client.fieldValues.update(key, (draft) => {
                    draft.value = value;
                  }),
                );
              }}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${field.name}`}
              onClick={remove}
            >
              <X aria-hidden strokeWidth={1.5} />
            </Button>
          </>
        ) : (
          <span
            className={
              row.value === null
                ? "pt-1.5 text-fg-tertiary"
                : "pt-1.5 whitespace-pre-wrap text-fg-primary"
            }
          >
            {shownValue(field, row.value)}
          </span>
        )}
        {status && (
          <span className="pt-2">
            <SaveStateMarker status={status} />
          </span>
        )}
      </dd>
    </div>
  );
}

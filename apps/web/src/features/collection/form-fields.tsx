// Manual entry's custom fields (DS-47, DS-26; FR-03.7): the fields the new album will apply, each with its editor
// and ×, and "+ Add field" with the account's other fields and "Create field…". Values are checked by their editors
// as they are typed, so the form holds only valid ones; saving applies them after the album.

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@tonaris/ui/components/button";

import type { AlbumForm } from "./album-form";
import { useCollectionData } from "./data";
import { FieldCreateDialog } from "./field-create-dialog";
import { FieldValueEditor } from "./field-editors";

/** The select's value for "Create field…": no field ID looks like it. */
const create = "create";

export function FormFields({
  applied,
  onChange,
}: {
  applied: AlbumForm["fieldValues"];
  onChange: (applied: AlbumForm["fieldValues"]) => void;
}) {
  const { fields, fieldsById } = useCollectionData();
  const [creating, setCreating] = useState(false);
  const unused = fields.filter((field) => !applied.some((each) => each.fieldId === field.id));
  const add = (fieldId: string) => onChange([...applied, { fieldId, value: null }]);

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-small text-fg-secondary">Custom fields</legend>
      {applied.map(({ fieldId, value }) => {
        const field = fieldsById.get(fieldId);
        if (!field) return null;
        return (
          <div key={fieldId} className="flex min-w-0 items-start gap-2">
            <span className="w-28 shrink-0 truncate pt-1.5 text-fg-secondary" title={field.name}>
              {field.name}
            </span>
            <FieldValueEditor
              field={field}
              value={value}
              label={field.name}
              onSave={(next) =>
                onChange(
                  applied.map((each) =>
                    each.fieldId === fieldId ? { fieldId, value: next } : each,
                  ),
                )
              }
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${field.name}`}
              onClick={() => onChange(applied.filter((each) => each.fieldId !== fieldId))}
            >
              <X aria-hidden strokeWidth={1.5} />
            </Button>
          </div>
        );
      })}
      {/* A select rather than a menu: it stays inside the form's dialog. */}
      <select
        aria-label="Add field"
        value=""
        onChange={(event) => {
          const chosen = event.target.value;
          if (chosen === create) setCreating(true);
          else if (chosen) add(chosen);
        }}
        className="h-8 self-start rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
      >
        <option value="">Add field…</option>
        {unused.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name}
          </option>
        ))}
        <option value={create}>Create field…</option>
      </select>
      {creating && <FieldCreateDialog onClose={() => setCreating(false)} onCreated={add} />}
    </fieldset>
  );
}

// Settings → Custom fields (DS-60; FR-03.6 to FR-03.18, X-07, X-09): the account's fields by name, with each one's
// type, options and usage, Trash included, and "New field". A row opens its edit panel:
// - the name, renamed inline, with uniqueness problems inline (X-06);
// - the type, locked while any album uses the field, and asking before a change that discards options;
// - the options, relabelled inline, added, and removed with × (a used option only through the confirmation);
// - Delete field, always through the confirmation (DS-28).
// Every control is a native button, input or select, so the page works by keyboard alone.

import { api } from "@/api";
import { apiUrl } from "@/config";
import { useCollectionData } from "@/features/collection/data";
import { FieldCreateDialog } from "@/features/collection/field-create-dialog";
import { fieldTypeNames } from "@/features/collection/field-types";
import { ConfirmDialog, type Confirmation } from "@/features/shell/confirm-dialog";
import { useKeyedRead } from "@/features/shell/use-keyed-read";
import { useAnnounce } from "@/features/sync/announcer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { ChevronRight, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import {
  fieldNameProblem,
  fieldNameTaken,
  fieldTypeInUse,
  fieldTypes,
  findNameConflict,
  isChoiceType,
  maxFieldOptions,
  maxFields,
  optionLabelProblem,
  optionLabelTaken,
  optionRemovalSchema,
  uuidv7,
  type CustomField,
  type FieldType,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

type Usage = { albums: number; inTrash: number };

const albums = (n: number) => `${n} ${n === 1 ? "album" : "albums"}`;

/** "Used by 214 albums · 3 in Trash", "Unused", or "—" before the counts arrive (DS-60). */
function usageText(usage: Usage | undefined): string {
  if (!usage) return "—";
  const total = usage.albums + usage.inTrash;
  if (total === 0) return "Unused";
  return usage.inTrash === 0
    ? `Used by ${albums(total)}`
    : `Used by ${albums(total)} · ${usage.inTrash} in Trash`;
}

/** Each field's usage from the server, which knows which albums are in Trash. */
async function loadUsage(): Promise<Map<string, Usage> | undefined> {
  const { data } = await api.v1.fields.usage.get();
  return data ? new Map(data.fields.map(({ fieldId, ...counts }) => [fieldId, counts])) : undefined;
}

/**
 * The server's usage counts, read again whenever `signature`, the fields and the albums applying them as this client
 * holds them, changes, so another session's change shows. Until the first read, undefined.
 */
function useFieldUsage(signature: string): Map<string, Usage> | undefined {
  return useKeyedRead(signature, loadUsage, { delayMs: 100 })?.value;
}

/** How many albums apply each field, as this client holds them, Trash included. */
function useClientUsage(): Map<string, number> {
  const { valuesByAlbum } = useCollectionData();
  const counts = new Map<string, number>();
  for (const values of valuesByAlbum.values()) {
    for (const { fieldId } of values) counts.set(fieldId, (counts.get(fieldId) ?? 0) + 1);
  }
  return counts;
}

/**
 * What removing the option affects (FR-03.17). Fetched directly: the typed client reads a path segment named
 * `options` as the OPTIONS method.
 */
async function readRemoval(fieldId: string, optionId: string) {
  try {
    const response = await fetch(`${apiUrl}/v1/fields/${fieldId}/options/${optionId}/removal`, {
      credentials: "include",
    });
    if (!response.ok) return undefined;
    return optionRemovalSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}

/** A save the save-state layer reports if it fails. */
const sent = (transaction: { isPersisted: { promise: Promise<unknown> } }) => {
  transaction.isPersisted.promise.catch(() => {});
};

export function CustomFieldsSettings() {
  const { fields, ready } = useCollectionData();
  const clientUsage = useClientUsage();
  const usage = useFieldUsage(
    fields.map((field) => `${field.id}:${clientUsage.get(field.id) ?? 0}`).join(),
  );
  const [open, setOpen] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const atLimit = fields.length >= maxFields;

  return (
    <div className="flex max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!ready || atLimit} onClick={() => setCreating(true)}>
          New field
        </Button>
        {atLimit && (
          <p className="text-small text-fg-secondary">
            You&apos;ve reached {maxFields} custom fields. Delete one to add another.
          </p>
        )}
      </div>
      {ready && fields.length === 0 ? (
        <p className="text-fg-secondary">
          No custom fields yet. Create one for anything you track, such as a rating or where you
          bought an album.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-subtle text-small text-fg-secondary">
              <th scope="col" className="py-2 pr-3 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Type
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Options
              </th>
              <th scope="col" className="py-2 font-medium">
                Usage
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <FieldRows
                key={field.id}
                field={field}
                usage={usage?.get(field.id)}
                used={(clientUsage.get(field.id) ?? 0) > 0}
                open={open === field.id}
                onToggle={() => setOpen(open === field.id ? undefined : field.id)}
                onClosed={() => setOpen(undefined)}
                onCreate={() => setCreating(true)}
                onConfirm={setConfirmation}
              />
            ))}
          </tbody>
        </table>
      )}
      {creating && (
        <FieldCreateDialog onClose={() => setCreating(false)} onCreated={(id) => setOpen(id)} />
      )}
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(undefined)} />
    </div>
  );
}

function FieldRows({
  field,
  usage,
  used,
  open,
  onToggle,
  onClosed,
  onCreate,
  onConfirm,
}: {
  field: CustomField;
  usage: Usage | undefined;
  /** Whether this client already knows of an album applying it, before the server's counts arrive. */
  used: boolean;
  open: boolean;
  onToggle: () => void;
  onClosed: () => void;
  onCreate: () => void;
  onConfirm: (confirmation: Confirmation) => void;
}) {
  const panelId = useId();
  const choice = isChoiceType(field.type);
  return (
    <>
      <tr className="border-b border-subtle">
        <th scope="row" className="py-1 pr-3 font-normal">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
            className="flex min-w-0 items-center gap-1.5 rounded-sm py-1 text-left text-fg-primary outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
          >
            <ChevronRight
              aria-hidden
              strokeWidth={1.5}
              className={cn(
                "size-4 shrink-0 text-fg-tertiary transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="truncate">{field.name}</span>
          </button>
        </th>
        <td className="py-1 pr-3 text-fg-secondary">{fieldTypeNames[field.type]}</td>
        <td className="py-1 pr-3 text-fg-secondary">
          {choice
            ? `${field.options.length} ${field.options.length === 1 ? "option" : "options"}`
            : "—"}
        </td>
        <td className="py-1 text-fg-secondary">{usageText(usage)}</td>
      </tr>
      {open && (
        <tr id={panelId} className="border-b border-subtle bg-raised">
          <td colSpan={4} className="p-4">
            <FieldPanel
              field={field}
              usage={usage}
              used={used}
              onClosed={onClosed}
              onCreate={onCreate}
              onConfirm={onConfirm}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function FieldPanel({
  field,
  usage,
  used,
  onClosed,
  onCreate,
  onConfirm,
}: {
  field: CustomField;
  usage: Usage | undefined;
  used: boolean;
  onClosed: () => void;
  onCreate: () => void;
  onConfirm: (confirmation: Confirmation) => void;
}) {
  const { fields } = useCollectionData();
  const client = useSyncClient();
  const announce = useAnnounce();
  const [error, setError] = useState<string>();
  const update = (change: (draft: CustomField) => void, confirmed?: Record<string, string>) => {
    if (!client) return;
    sent(
      confirmed
        ? client.fields.update(field.id, { metadata: { confirmed } }, change)
        : client.fields.update(field.id, change),
    );
  };

  function nameProblem(name: string): string | undefined {
    const problem = fieldNameProblem(name);
    if (problem) return problem.problem.detail;
    const taken = findNameConflict(name, fields, field.id);
    return taken ? fieldNameTaken(taken.name).problem.detail : undefined;
  }

  async function deleteField() {
    setError(undefined);
    const { data } = await api.v1.fields({ fieldId: field.id }).deletion.get();
    if (!data) {
      setError(`Couldn't check what deleting '${field.name}' affects. Try again.`);
      return;
    }
    const total = data.albums + data.inTrash;
    const labels = data.options.map((option) => option.label).join(", ");
    onConfirm({
      title: `Delete field '${data.field.name}'?`,
      scope: [
        data.options.length === 0
          ? "The field"
          : `The field and its ${data.options.length === 1 ? "option" : `${data.options.length} options`}: ${labels}`,
        total === 0
          ? "No album uses it"
          : `Values on ${albums(total)}${data.inTrash > 0 ? `, ${data.inTrash} of them in Trash` : ""}`,
      ],
      consequences: ["This can't be undone — Trash and album restore won't bring it back."],
      action: "Delete field",
      onConfirm: () => {
        if (!client) return;
        sent(
          client.fields.delete(field.id, {
            metadata: { confirmed: { [field.id]: data.scopeHash } },
          }),
        );
        announce(`Deleted ${data.field.name}`);
        onClosed();
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
      <InlineText
        label="Name"
        value={field.name}
        check={nameProblem}
        onSave={(name) =>
          update((draft) => {
            draft.name = name;
          })
        }
      />
      <TypeChoice
        field={field}
        usage={usage}
        used={used}
        onCreate={onCreate}
        onChange={(type) =>
          update((draft) => {
            draft.type = type;
            if (!isChoiceType(type)) draft.options = [];
          })
        }
      />
      {isChoiceType(field.type) && (
        <OptionsEditor field={field} update={update} onConfirm={onConfirm} onError={setError} />
      )}
      <div>
        <Button variant="danger" onClick={() => void deleteField()}>
          Delete field
        </Button>
      </div>
    </div>
  );
}

/** A label and an input that saves on Enter or when left, and reverts on Escape; a problem stays with the input. */
function InlineText({
  label,
  value,
  check,
  onSave,
  hideLabel = false,
}: {
  label: string;
  value: string;
  check: (text: string) => string | undefined;
  onSave: (text: string) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string>();
  const [problem, setProblem] = useState<string>();

  function commit() {
    if (draft === undefined) return;
    const text = draft.trim();
    if (text === value) {
      setDraft(undefined);
      setProblem(undefined);
      return;
    }
    const found = check(text);
    if (found) {
      setProblem(found);
      return;
    }
    onSave(text);
    setDraft(undefined);
    setProblem(undefined);
  }

  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape" && draft !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(undefined);
      setProblem(undefined);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-small text-fg-secondary"}>
        {label}
      </label>
      <Input
        id={id}
        value={draft ?? value}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : `${id}-problem`}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(undefined);
        }}
        onBlur={commit}
        onKeyDown={keys}
        className="max-w-sm"
      />
      {problem && (
        <p id={`${id}-problem`} className="text-small text-status-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

const selectClass =
  "h-8 max-w-sm rounded-md border border-strong bg-app px-2 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid disabled:opacity-50";

/**
 * The type select (FR-03.12, FR-03.13): disabled while any album uses the field, saying why, with Create new field;
 * from a choice type to another, it lists the options the change discards and waits for Change type.
 */
function TypeChoice({
  field,
  usage,
  used,
  onCreate,
  onChange,
}: {
  field: CustomField;
  usage: Usage | undefined;
  used: boolean;
  onCreate: () => void;
  onChange: (type: FieldType) => void;
}) {
  const id = useId();
  const [pending, setPending] = useState<FieldType>();
  const counts = usage ?? { albums: used ? 1 : 0, inTrash: 0 };
  const locked = used || counts.albums + counts.inTrash > 0;

  function choose(type: FieldType) {
    if (type === field.type) {
      setPending(undefined);
      return;
    }
    if (isChoiceType(field.type) && !isChoiceType(type) && field.options.length > 0) {
      setPending(type);
      return;
    }
    setPending(undefined);
    onChange(type);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small text-fg-secondary">
        Type
      </label>
      <select
        id={id}
        value={pending ?? field.type}
        disabled={locked}
        aria-describedby={locked ? `${id}-locked` : undefined}
        onChange={(event) => {
          const chosen = fieldTypes.find((each) => each === event.target.value);
          if (chosen) choose(chosen);
        }}
        className={selectClass}
      >
        {fieldTypes.map((type) => (
          <option key={type} value={type}>
            {fieldTypeNames[type]}
          </option>
        ))}
      </select>
      {locked && (
        <div className="flex flex-wrap items-center gap-3">
          <p id={`${id}-locked`} className="text-small text-fg-secondary">
            {
              fieldTypeInUse({ active: counts.albums + counts.inTrash, trashed: counts.inTrash })
                .problem.detail
            }
          </p>
          <Button size="sm" onClick={onCreate}>
            Create new field
          </Button>
        </div>
      )}
      {pending && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-small text-status-warning">
            Changing to {fieldTypeNames[pending]} discards its options:{" "}
            {field.options.map((option) => option.label).join(", ")}.
          </p>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              onChange(pending);
              setPending(undefined);
            }}
          >
            Change type
          </Button>
          <Button size="sm" onClick={() => setPending(undefined)}>
            Keep options
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A choice field's options (FR-03.14 to FR-03.17): each relabelled inline, removed with × (at once when no album
 * chooses it, otherwise through the confirmation), and a new one added at the end.
 */
function OptionsEditor({
  field,
  update,
  onConfirm,
  onError,
}: {
  field: CustomField;
  update: (change: (draft: CustomField) => void, confirmed?: Record<string, string>) => void;
  onConfirm: (confirmation: Confirmation) => void;
  onError: (error: string | undefined) => void;
}) {
  const announce = useAnnounce();
  const addId = useId();
  const [adding, setAdding] = useState("");
  const [addProblem, setAddProblem] = useState<string>();

  function labelProblem(label: string, selfId?: string): string | undefined {
    const problem = optionLabelProblem(label, "label");
    if (problem) return problem.problem.detail;
    const taken = findNameConflict(
      label,
      field.options.map(({ id, label: name }) => ({ id, name })),
      selfId,
    );
    return taken ? optionLabelTaken(taken.name).problem.detail : undefined;
  }

  function add() {
    const label = adding.trim();
    const problem = labelProblem(label);
    if (problem) {
      setAddProblem(problem);
      return;
    }
    update((draft) => {
      draft.options.push({ id: uuidv7(), label });
    });
    announce(`Added ${label}`);
    setAdding("");
  }

  async function remove(optionId: string, label: string) {
    onError(undefined);
    const data = await readRemoval(field.id, optionId);
    if (!data) {
      onError(`Couldn't check where '${label}' is chosen. Try again.`);
      return;
    }
    const removeIt = () => {
      update(
        (draft) => {
          draft.options = draft.options.filter((option) => option.id !== optionId);
        },
        { [optionId]: data.scopeHash },
      );
      announce(`Removed ${label}`);
    };
    const total = data.albums + data.inTrash;
    // An option no album chooses goes at once (FR-03.17).
    if (total === 0) {
      removeIt();
      return;
    }
    onConfirm({
      title: `Remove option '${label}'?`,
      scope: [
        `Chosen on ${albums(total)} in '${field.name}'`,
        ...(data.inTrash > 0 ? [`${data.inTrash} of them in Trash`] : []),
      ],
      consequences: [
        field.type === "single_choice"
          ? "Those albums keep the field, empty."
          : "Those albums keep their other options.",
        "This can't be undone.",
      ],
      action: `Remove from ${albums(total)}`,
      onConfirm: removeIt,
    });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-small text-fg-secondary">Options</legend>
      {field.options.length === 0 && <p className="text-small text-fg-tertiary">No options yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {field.options.map((option) => (
          <li key={option.id} className="flex items-start gap-1">
            <InlineText
              hideLabel
              label={`Option '${option.label}'`}
              value={option.label}
              check={(label) => labelProblem(label, option.id)}
              onSave={(label) =>
                update((draft) => {
                  const each = draft.options.find((one) => one.id === option.id);
                  if (each) each.label = label;
                })
              }
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${option.label}`}
              onClick={() => void remove(option.id, option.label)}
            >
              <X aria-hidden strokeWidth={1.5} />
            </Button>
          </li>
        ))}
      </ul>
      {field.options.length < maxFieldOptions && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="New option"
              value={adding}
              placeholder="New option"
              aria-invalid={addProblem !== undefined}
              aria-describedby={addProblem === undefined ? undefined : addId}
              onChange={(event) => {
                setAdding(event.target.value);
                setAddProblem(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              className="max-w-sm"
            />
            <Button size="sm" onClick={add}>
              Add option
            </Button>
          </div>
          {addProblem && (
            <p id={addId} className="text-small text-status-danger">
              {addProblem}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

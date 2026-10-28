// The "New field" dialog (DS-60; FR-03.6, FR-03.9, FR-03.10): a name, a type, and for a choice field its options.
// The name and labels are checked as the server checks them, with the same words, before anything is sent: not
// blank, at most 200 characters, a name no other field has and a label once per field, case-insensitively (X-06).
// Saving defines the field; the caller can then apply it, as "+ Add field" → "Create field…" does (DS-46). Settings →
// Custom fields reuses it (TON-53).

import { useSyncClient } from "@/features/sync/sync-provider";
import { Plus, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import {
  fieldNameProblem,
  fieldNameTaken,
  fieldTypes,
  findNameConflict,
  isChoiceType,
  maxFieldOptions,
  maxFields,
  optionLabelProblem,
  uuidv7,
  type CustomField,
  type FieldType,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionData } from "./data";

/** Each type, as the type select names it. */
export const fieldTypeNames: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  yes_no: "Yes/no",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
};

const control =
  "h-8 min-w-0 rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid";

type DraftOption = { id: string; label: string };

/** What is wrong with a new field, if anything: its name, or an option by index. */
export function newFieldProblems(
  name: string,
  type: FieldType,
  options: readonly DraftOption[],
  fields: readonly CustomField[],
): { name?: string; options: Record<number, string>; form?: string } {
  const problems: { name?: string; options: Record<number, string>; form?: string } = {
    options: {},
  };
  const trimmed = name.trim();
  const nameProblem = fieldNameProblem(trimmed);
  const taken = findNameConflict(trimmed, fields);
  if (nameProblem) problems.name = nameProblem.problem.detail;
  else if (taken) problems.name = fieldNameTaken(taken.name).problem.detail;
  if (fields.length >= maxFields) {
    problems.form = `You've reached ${maxFields} custom fields. Delete one to add another.`;
  }
  if (!isChoiceType(type)) return problems;
  const seen: { id: string; name: string }[] = [];
  for (const [index, option] of options.entries()) {
    const label = option.label.trim();
    // A row left empty is no option.
    if (label === "") continue;
    const problem = optionLabelProblem(label, `options.${index}`);
    if (problem) problems.options[index] = problem.problem.detail ?? "";
    else if (findNameConflict(label, seen)) {
      problems.options[index] = "Each option needs its own label.";
    }
    seen.push({ id: option.id, name: label });
  }
  return problems;
}

export function FieldCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called with the new field's ID once it is defined. */
  onCreated?: (fieldId: string) => void;
}) {
  const { fields } = useCollectionData();
  const client = useSyncClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState<DraftOption[]>([{ id: uuidv7(), label: "" }]);
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const choice = isChoiceType(type);
  // Option rows left empty are left out: a choice field may start without options.
  const filled = options.filter((option) => option.label.trim() !== "");
  const problems = newFieldProblems(name, type, choice ? options : [], fields);
  const shown = submitted ? problems : { options: {} as Record<number, string> };
  const hasProblems =
    problems.name !== undefined ||
    problems.form !== undefined ||
    Object.keys(problems.options).length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitted(true);
    if (hasProblems || !client) {
      nameRef.current?.focus();
      return;
    }
    const field: CustomField = {
      id: uuidv7(),
      name: name.trim(),
      type,
      options: choice
        ? filled.map((option) => ({ id: option.id, label: option.label.trim() }))
        : [],
    };
    client.fields.insert(field).isPersisted.promise.catch(() => {});
    onCreated?.(field.id);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[480px]" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>New field</DialogTitle>
          <DialogDescription>
            Fields are yours across the collection; each album uses the ones it needs.
          </DialogDescription>
        </DialogHeader>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
          }}
        >
          {shown.form && (
            <p role="alert" className="text-small text-status-danger">
              {shown.form}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-small text-fg-secondary">
              Name
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              value={name}
              aria-invalid={shown.name !== undefined}
              aria-describedby={shown.name === undefined ? undefined : `${id}-name-problem`}
              onChange={(event) => setName(event.target.value)}
              className={cn(control, shown.name && "border-status-danger")}
            />
            {shown.name && (
              <p id={`${id}-name-problem`} className="text-small text-status-danger">
                {shown.name}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-type`} className="text-small text-fg-secondary">
              Type
            </label>
            <select
              id={`${id}-type`}
              value={type}
              onChange={(event) => {
                const chosen = fieldTypes.find((each) => each === event.target.value);
                if (chosen) setType(chosen);
              }}
              className={control}
            >
              {fieldTypes.map((each) => (
                <option key={each} value={each}>
                  {fieldTypeNames[each]}
                </option>
              ))}
            </select>
          </div>
          {choice && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-small text-fg-secondary">Options</legend>
              {options.map((option, index) => (
                <div key={option.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <input
                      aria-label={`Option ${index + 1}`}
                      value={option.label}
                      aria-invalid={shown.options[index] !== undefined}
                      onChange={(event) =>
                        setOptions(
                          options.map((each) =>
                            each.id === option.id
                              ? { id: each.id, label: event.target.value }
                              : each,
                          ),
                        )
                      }
                      className={cn(
                        control,
                        "flex-1",
                        shown.options[index] && "border-status-danger",
                      )}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => setOptions(options.filter((each) => each.id !== option.id))}
                    >
                      <X aria-hidden strokeWidth={1.5} />
                    </Button>
                  </div>
                  {shown.options[index] && (
                    <p className="text-small text-status-danger">{shown.options[index]}</p>
                  )}
                </div>
              ))}
              {options.length < maxFieldOptions && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setOptions([...options, { id: uuidv7(), label: "" }])}
                >
                  <Plus aria-hidden strokeWidth={1.5} />
                  Add option
                </Button>
              )}
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" aria-keyshortcuts="Meta+Enter">
              Create field
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

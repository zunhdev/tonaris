// The "New field" dialog (DS-60; FR-03.6, FR-03.9, FR-03.10): a name, a type, and for a choice field its options.
// The name and labels are checked as the server checks them, with the same words, before anything is sent: not
// blank, at most 200 characters, a name no other field has and a label once per field, case-insensitively (X-06).
// Saving defines the field; the caller can then apply it, as "+ Add field" → "Create field…" does (DS-46). Settings →
// Custom fields reuses it (TON-53).

import { sent } from "@/client/sync/writer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { Plus, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";
import { Select } from "@tonaris/ui/components/select";

import { useCollectionData } from "./data";
import { fieldTypeNames } from "./field-types";

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
    sent(client.fields.insert(field));
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
          <Field label="Name" problem={shown.name}>
            {(control) => (
              <Input
                {...control}
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Type">
            {(control) => (
              <Select
                {...control}
                value={type}
                onChange={(event) => {
                  const chosen = fieldTypes.find((each) => each === event.target.value);
                  if (chosen) setType(chosen);
                }}
              >
                {fieldTypes.map((each) => (
                  <option key={each} value={each}>
                    {fieldTypeNames[each]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {choice && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-small text-fg-secondary">Options</legend>
              {options.map((option, index) => (
                <div key={option.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Input
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
                      className="flex-1"
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
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" aria-keyshortcuts="Meta+Enter">
              Create field
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

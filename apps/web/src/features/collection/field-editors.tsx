// Custom field editors (DS-26; FR-03.7, FR-03.10), one per type, for the inspector and manual entry. Text grows to
// several lines with Shift+Enter; number and date are typed, a date also picked from the browser's calendar. Text,
// number and date save on Enter or when left and discard on Escape, and a refused value stays with its reason (X-05).
// Yes/no is `Yes · No · —`, where `—` is applied-empty; a single choice is a select with Clear; a multiple choice is
// chips with × and a select of the other options. Those save as chosen. Empty is never shown as zero or No.

import { CalendarDays, X } from "lucide-react";
import { useRef } from "react";

import { fieldValueProblem, type CustomField, type FieldValueData } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";
import { SegmentedControl, type SegmentedOption } from "@tonaris/ui/components/segmented-control";
import { Select } from "@tonaris/ui/components/select";
import { Textarea } from "@tonaris/ui/components/textarea";

import { useInlineDraft } from "./inline-draft";

/** A value as people read it (DS-26): "Empty" when applied-empty, options by label, Yes or No. */
export function shownValue(field: CustomField, value: FieldValueData): string {
  if (value === null) return field.type === "yes_no" ? "—" : "Empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const label = (id: string) => field.options.find((option) => option.id === id)?.label ?? "";
  if (Array.isArray(value)) return value.map(label).join(", ");
  return field.type === "single_choice" ? label(value) : value;
}

type EditorProps = {
  field: CustomField;
  value: FieldValueData;
  /** Saves a value already checked against the field's type. */
  onSave: (value: FieldValueData) => void;
  /** The editor's accessible name, such as "Rating of 'Bleach'". */
  label: string;
  disabled?: boolean;
};

export function FieldValueEditor(props: EditorProps) {
  const { field } = props;
  if (field.type === "yes_no") return <YesNoEditor {...props} />;
  if (field.type === "single_choice") return <SingleChoiceEditor {...props} />;
  if (field.type === "multiple_choice") return <MultipleChoiceEditor {...props} />;
  return <TypedEditor {...props} />;
}

const asText = (value: FieldValueData) => (typeof value === "string" ? value : "");

/**
 * Text, number and date: typed, saved on Enter or when left, discarded on Escape. While it holds a draft, a change
 * from elsewhere doesn't replace it (DS-82), and leaving Editing mode commits it (DS-45).
 */
function TypedEditor({ field, value, onSave, label, disabled = false }: EditorProps) {
  const picker = useRef<HTMLInputElement>(null);
  const draft = useInlineDraft<HTMLInputElement & HTMLTextAreaElement>({
    value: asText(value),
    check: (typed) => fieldValueProblem(field, typed)?.problem.detail,
    save: (typed) => {
      const next = typed.trim() === "" ? null : typed.trim();
      if (next !== value) onSave(next);
    },
    // Shift+Enter adds a line to text (DS-26), and commits none of them.
    multiline: true,
  });
  const shown = draft.text;
  const placeholder = field.type === "date" ? "YYYY-MM-DD" : "Empty";
  return (
    // Its name is the row's, beside it; the field is named for assistive technology.
    <Field label={label} hideLabel problem={draft.refusal} className="min-w-0 flex-1 gap-1">
      {(control) => (
        <div className="flex items-start gap-1">
          {field.type === "text" ? (
            <Textarea
              {...draft.props}
              {...control}
              disabled={disabled}
              placeholder={placeholder}
              // One line until Shift+Enter adds another (DS-26).
              rows={Math.max(1, shown.split("\n").length)}
              className="min-h-8 flex-1 resize-none py-1"
            />
          ) : (
            <Input
              {...draft.props}
              {...control}
              disabled={disabled}
              placeholder={placeholder}
              inputMode={field.type === "number" ? "decimal" : undefined}
              className="flex-1"
            />
          )}
          {field.type === "date" && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Pick a date"
                disabled={disabled}
                onClick={() => picker.current?.showPicker?.()}
              >
                <CalendarDays aria-hidden strokeWidth={1.5} />
              </Button>
              {/* The browser's own calendar (DS-26), off screen; its choice is saved at once. */}
              <input
                ref={picker}
                type="date"
                tabIndex={-1}
                aria-hidden
                value={asText(value)}
                onChange={(event) => {
                  if (event.target.value) onSave(event.target.value);
                }}
                className="pointer-events-none absolute size-0 opacity-0"
              />
            </>
          )}
        </div>
      )}
    </Field>
  );
}

const yesNoOptions: readonly SegmentedOption<"yes" | "no" | "empty">[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "empty", label: "—" },
];

/** `Yes · No · —`, where `—` is applied-empty (DS-26). */
function YesNoEditor({ value, onSave, label, disabled = false }: EditorProps) {
  return (
    <SegmentedControl
      aria-label={label}
      options={yesNoOptions}
      disabled={disabled}
      value={value === true ? "yes" : value === false ? "no" : "empty"}
      onValueChange={(chosen) => onSave(chosen === "yes" ? true : chosen === "no" ? false : null)}
    />
  );
}

/** A select of the field's options, with Clear for applied-empty (DS-26). */
function SingleChoiceEditor({ field, value, onSave, label, disabled = false }: EditorProps) {
  return (
    <Select
      aria-label={label}
      disabled={disabled}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onSave(event.target.value || null)}
      className="flex-1"
    >
      <option value="">{value === null ? "Empty" : "Clear"}</option>
      {field.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

/** The options chosen, as chips with ×, and a select of the rest (DS-26). No option twice. */
function MultipleChoiceEditor({ field, value, onSave, label, disabled = false }: EditorProps) {
  const chosen = Array.isArray(value) ? value : [];
  const rest = field.options.filter((option) => !chosen.includes(option.id));
  const save = (ids: string[]) => onSave(ids.length === 0 ? null : ids);
  return (
    <fieldset className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label={label}>
      {chosen.length === 0 && <span className="text-small text-fg-tertiary">Empty</span>}
      {field.options
        .filter((option) => chosen.includes(option.id))
        .map((option) => (
          <span
            key={option.id}
            className="flex h-6 items-center gap-1 rounded-full border border-subtle bg-raised pr-1 pl-2.5 text-small text-fg-primary"
          >
            {option.label}
            <button
              type="button"
              aria-label={`Remove ${option.label}`}
              disabled={disabled}
              onClick={() => save(chosen.filter((id) => id !== option.id))}
              className="flex size-4 items-center justify-center rounded-full text-fg-tertiary outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
            >
              <X aria-hidden strokeWidth={1.5} className="size-3" />
            </button>
          </span>
        ))}
      {rest.length > 0 && (
        <Select
          aria-label={`Add an option to ${label}`}
          disabled={disabled}
          value=""
          onChange={(event) => {
            if (event.target.value) save([...chosen, event.target.value]);
          }}
          className="h-6 text-small"
        >
          <option value="">Add option</option>
          {rest.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </fieldset>
  );
}

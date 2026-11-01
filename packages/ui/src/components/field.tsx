// Field (DS-20): a label over its control, with a hint or a problem under it, wired together: the label names the
// control, the hint or the problem describes it, and a problem marks it invalid (X-05). The label is DS-13's small size
// in `fg.secondary`, the hint in `fg.tertiary`; a problem takes the hint's place, in `status.danger`. A control that
// can't be a label's target, such as a segmented control or a switch, is a `group`, named by the label's ID.

import { useId, type ReactNode } from "react";

import { cn } from "@tonaris/ui/lib/utils";

/** What a field gives its control to spread: the ID its label names, and what describes it. */
type FieldControl = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

function Field({
  label,
  hint,
  problem,
  group = false,
  hideLabel = false,
  className,
  children,
}: {
  label: ReactNode;
  /** Words under the control, such as what a value is for; a problem takes their place. */
  hint?: ReactNode;
  /** Why the value can't be used, under the control. */
  problem?: ReactNode;
  /** The control isn't a label's target: it takes `aria-labelledby` from the label's ID, the second argument. */
  group?: boolean;
  /** The label only for assistive technology, where the field's place already shows what it is. */
  hideLabel?: boolean;
  className?: string;
  /** The control, given its wiring. */
  children: (control: FieldControl, labelId: string) => ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const belowId = problem === undefined ? `${id}-hint` : `${id}-problem`;
  const control: FieldControl = {
    id,
    "aria-describedby": problem === undefined && hint === undefined ? undefined : belowId,
    "aria-invalid": problem === undefined ? undefined : true,
  };
  const labelClass = hideLabel ? "sr-only" : "text-small text-fg-secondary";
  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      {group ? (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      ) : (
        <label id={labelId} htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      {children(control, labelId)}
      {problem === undefined ? (
        hint !== undefined && (
          <p id={belowId} className="text-small text-fg-tertiary">
            {hint}
          </p>
        )
      ) : (
        <p id={belowId} className="text-small text-status-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

export { Field };

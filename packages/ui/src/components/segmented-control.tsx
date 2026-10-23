// SegmentedControl (DS-20): one choice among a few, shown side by side, as in View options and Settings →
// Preferences (DS-49, DS-94). It is Base UI's radio group, so assistive technology hears a radio group, it takes one
// tab stop, and the arrow keys move between options. The chosen option takes the selected surface (DS-12); focus is
// a solid `focus` outline (DS-14).

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "cn";
import type { ReactNode } from "react";

export type SegmentedOption<Value extends string> = { value: Value; label: ReactNode };

function SegmentedControl<Value extends string>({
  value,
  onValueChange,
  options,
  disabled,
  className,
  ...labelling
}: {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly SegmentedOption<Value>[];
  disabled?: boolean;
  className?: string;
} & ({ "aria-label": string } | { "aria-labelledby": string })) {
  return (
    <RadioGroup<Value>
      data-slot="segmented-control"
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className={cn(
        "flex rounded-md border border-subtle p-0.5 data-disabled:opacity-50",
        className,
      )}
      {...labelling}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className="flex h-6 min-w-0 flex-1 cursor-default items-center justify-center gap-1.5 rounded-sm px-2 text-small font-medium whitespace-nowrap text-fg-secondary transition-colors duration-100 ease-enter outline-none select-none hover:text-fg-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid data-checked:bg-selected data-checked:text-fg-primary data-disabled:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0"
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

export { SegmentedControl };

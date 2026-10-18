// Label (DS-20): shadcn's label, in DS-13's base size with primary text.

import { cn } from "cn";
import type * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // Callers associate it with their control through `htmlFor`.
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-base font-medium text-fg-primary select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

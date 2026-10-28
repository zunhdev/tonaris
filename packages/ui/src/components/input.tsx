// Input (DS-20): shadcn's Base UI input, restyled to DS-15. 32px high (forms), 6px radius, a `border.strong`
// edge (3:1, DS-14), `text.input`'s 14/20 size (16px below 768px, so iOS doesn't zoom; DS-110) in `fg.primary`, and the
// same solid `focus` outline as buttons. The size is spelled out: `text-input` would name the `input` color token,
// shadcn's `--color-input`, which is `border.strong` (TON-101).

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-strong bg-app px-2.5 text-[0.875rem]/5 text-fg-primary transition-colors duration-100 ease-enter outline-none placeholder:text-fg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid disabled:pointer-events-none disabled:text-fg-disabled disabled:opacity-50 aria-invalid:border-status-danger max-md:text-[1rem]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

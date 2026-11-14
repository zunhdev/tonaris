// Input (DS-20): shadcn's Base UI input, restyled to DS-15. 32px high (forms), 6px radius, filled with `bg.field` and
// edged in `border.subtle`, which turns `border.strong` (3:1, DS-14) on hover (TON-168); `text.control`'s 14/20 size (16px below 768px, so iOS doesn't zoom; DS-110) in `fg.primary`, and the
// same solid `focus` outline as buttons. Select and Textarea share its look (`controlClass`).

import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@tonaris/ui/lib/utils";

/** A form control's look, without its height or width: Input's, Select's and Textarea's. */
const controlClass =
  "min-w-0 rounded-md border border-subtle bg-field px-2.5 text-control text-fg-primary transition-colors duration-100 ease-enter outline-none placeholder:text-fg-tertiary hover:border-strong focus-ring disabled:pointer-events-none disabled:text-fg-disabled disabled:opacity-50 aria-invalid:border-status-danger max-md:text-[1rem]";

function Input({ className, type, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(controlClass, "h-8 w-full", className)}
      {...props}
    />
  );
}

export { controlClass, Input };

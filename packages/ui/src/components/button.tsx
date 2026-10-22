// Button (DS-20): shadcn's Base UI button, restyled to DS-15. Heights 24, 28 (default: toolbars, menus,
// sidebar) and 32 (forms, dialogs); 6px radius; variants primary, secondary, ghost and danger.
// Primary is the accent fill with an `fg.on-accent` label (DS-12, 5.0:1); focus is a solid `focus` outline (DS-14).

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-base font-medium whitespace-nowrap transition-colors duration-100 ease-enter outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-status-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-accent-fill text-fg-on-accent hover:bg-accent-fill/90",
        secondary: "border-subtle bg-raised text-fg-primary hover:bg-hover",
        ghost: "text-fg-secondary hover:bg-hover hover:text-fg-primary aria-expanded:bg-hover",
        danger: "border-subtle bg-raised text-status-danger hover:bg-hover",
      },
      size: {
        sm: "h-6 px-2 text-small [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-7 px-2.5",
        lg: "h-8 px-3",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-7",
        "icon-lg": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

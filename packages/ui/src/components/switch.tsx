// Switch (DS-20): one on-or-off setting that applies at once, such as an album's Live (DS-46, DS-47). Base UI's
// switch, so assistive technology hears a switch with its state. The checked track takes `accent.solid`; focus is a
// solid `focus` outline (DS-14).

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@tonaris/ui/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-default items-center rounded-full border border-strong bg-raised p-0.5 transition-colors duration-100 ease-enter outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid data-checked:border-transparent data-checked:bg-accent-solid data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 rounded-full bg-fg-primary transition-transform duration-100 ease-enter data-checked:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

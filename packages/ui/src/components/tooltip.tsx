// Tooltip (DS-20): Base UI's tooltip, on the tooltip layer 90 (DS-18) with the floating shadow (DS-16), opening in
// 150ms (DS-17). Tooltips only add clarity for pointer and keyboard users; what they say is also in the trigger's
// accessible name, so nobody depends on them (DS-115). A shortcut in a tooltip follows its words, dimmer, as a
// menu's does (TON-122).

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  side = "top",
  sideOffset = 6,
  className,
  ...props
}: TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner className="isolate z-90" side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "origin-(--transform-origin) rounded-md bg-raised px-2 py-1 text-small text-fg-primary shadow-floating duration-150 ease-enter data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/** The key that does what the trigger does, after the tooltip's words; the trigger carries it in `aria-keyshortcuts`. */
function TooltipShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="tooltip-shortcut"
      className={cn("ml-2 font-sans text-fg-tertiary", className)}
      {...props}
    />
  );
}

export { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger };

// Command palette (DS-20, DS-75): Base UI's dialog on the palette layer (DS-18, 70), anchored near the top of the
// window, 640px wide with the 12px radius and the floating shadow (DS-15, DS-16), over the dimmed backdrop. Below
// 768px it fills the screen, as DS-75's mobile search sheet, inside the safe area (DS-110). It has no close button:
// Escape or a click outside closes it. Its contents are the caller's: the field and the listbox of results.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { scrimClass } from "@tonaris/ui/lib/floating";
import { cn } from "@tonaris/ui/lib/utils";

function CommandDialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="command-dialog" {...props} />;
}

function CommandDialogContent({
  className,
  label,
  children,
  ...props
}: DialogPrimitive.Popup.Props & {
  /** The dialog's accessible name, read but not shown. */
  label: string;
}) {
  return (
    <DialogPrimitive.Portal data-slot="command-portal">
      <DialogPrimitive.Backdrop data-slot="command-overlay" className={cn(scrimClass, "z-70")} />
      <DialogPrimitive.Popup
        data-slot="command-content"
        className={cn(
          "fixed top-[12dvh] left-1/2 z-70 flex max-h-[min(36rem,76dvh)] w-[calc(100%-2rem)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-raised text-fg-primary shadow-floating duration-200 ease-enter outline-none data-open:animate-in data-open:fade-in-0 motion-safe:data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95",
          "max-md:inset-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:rounded-none max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export { CommandDialog, CommandDialogContent };

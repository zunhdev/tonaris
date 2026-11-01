// Dialog (DS-20): Base UI's dialog, styled like the AlertDialog (DS-15 to DS-18): a floating layer (12px radius, the
// floating shadow, the dialog layer 60) over a dimmed backdrop, opening in 200ms (DS-17) and only fading under
// reduced motion. Unlike the AlertDialog it asks nothing: Escape, the close button or a click outside closes it.
// Focus stays inside until it closes, then returns to where it was.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";

import { Button } from "@tonaris/ui/components/button";
import {
  dialogDescriptionClass,
  dialogSurfaceClass,
  dialogTitleClass,
  scrimClass,
} from "@tonaris/ui/lib/floating";
import { cn } from "@tonaris/ui/lib/utils";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={cn(scrimClass, "z-60")} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          dialogSurfaceClass,
          "max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />}
        >
          <X strokeWidth={1.5} aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 pr-8", className)}
      {...props}
    />
  );
}

/** The dialog's buttons, at its end: side by side from 640px, stacked below it with the main one on top. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogTitleClass, className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogDescriptionClass, className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle };

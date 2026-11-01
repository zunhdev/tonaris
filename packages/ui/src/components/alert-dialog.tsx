// AlertDialog (DS-28's base): shadcn's Base UI alert dialog, restyled to DS-15 to DS-18. The popup is a floating
// layer (12px radius, the floating shadow, the dialog layer 60) over a dimmed backdrop, with 32px buttons; it opens
// in 200ms (DS-17) and only fades under reduced motion. Focus stays inside until it closes.

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type * as React from "react";

import { Button } from "@tonaris/ui/components/button";
import {
  dialogDescriptionClass,
  dialogSurfaceClass,
  dialogTitleClass,
  scrimClass,
} from "@tonaris/ui/lib/floating";
import { cn } from "@tonaris/ui/lib/utils";

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-overlay"
        className={cn(scrimClass, "z-60")}
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(dialogSurfaceClass, "max-w-md", className)}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(dialogTitleClass, className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(dialogDescriptionClass, className)}
      {...props}
    />
  );
}

/** The confirming button; the caller acts and closes the dialog. Use `variant="danger"` when it can't be undone (DS-28). */
function AlertDialogAction({
  size = "lg",
  variant = "primary",
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" size={size} variant={variant} {...props} />;
}

function AlertDialogCancel({
  variant = "secondary",
  size = "lg",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};

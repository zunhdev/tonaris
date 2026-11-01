// The floating layers' shared classes (DS-15 to DS-18), so the dialogs, the palette and the menus can't drift apart:
// the dimmed backdrop, a dialog's surface with its title and description, and the layer a popover or menu sits on.

import { cn } from "@tonaris/ui/lib/utils";

/** The dimmed backdrop under a dialog or the palette, fading in 200ms (DS-17); the caller adds its layer (DS-18). */
export const scrimClass =
  "fixed inset-0 isolate bg-scrim duration-200 ease-enter data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

/**
 * A dialog's surface, centred on the dialog layer 60: 12px radius and the floating shadow, opening in 200ms and only
 * fading under reduced motion (DS-15 to DS-17). The caller adds its width.
 */
export const dialogSurfaceClass =
  "fixed top-1/2 left-1/2 z-60 grid w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-raised p-5 text-fg-primary shadow-floating duration-200 ease-enter outline-none data-open:animate-in data-open:fade-in-0 motion-safe:data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95";

/** A dialog's title and description (DS-13). */
export const dialogTitleClass = "text-title text-fg-primary";
export const dialogDescriptionClass = "text-base text-fg-secondary";

/**
 * The positioner of a popover or menu: on the dropdown layer 40, or, opened from inside a dialog, on the dialog's layer
 * 60 (DS-18), where its portal, added after the dialog's, stacks above it. On 40 it would sit under the dialog, out of
 * reach.
 */
export function floatingLayerClass(inDialog: boolean): string {
  return cn("isolate outline-none", inDialog ? "z-60" : "z-40");
}

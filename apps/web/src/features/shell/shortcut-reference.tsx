// The shortcut reference (DS-78): `?` or the account menu's "Keyboard shortcuts" opens it, listing the shortcuts
// that work now. Shortcuts arriving with later issues join the list with them. It ends with a way to Help's own
// Keyboard shortcuts page, which prints, and to the rest of Help (TON-315).

import { platformKeys, shortcutReference } from "@/common/shortcuts";
import { helpAddress } from "@/features/help/links";
import { useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";

export function ShortcutReference({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The title takes the focus, so the sheet opens at its top rather than at the link to Help at its end.
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={title}>
        <DialogHeader>
          <DialogTitle ref={title} tabIndex={-1} className="outline-none">
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            They work anywhere except while you type in a field.
          </DialogDescription>
        </DialogHeader>
        {shortcutReference.map((group, index) => (
          <section key={group.title} aria-labelledby={`shortcuts-${index}`}>
            <h3 id={`shortcuts-${index}`} className="mb-1 text-small font-medium text-fg-secondary">
              {group.title}
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              {group.keys.map(({ keys, action }) => (
                <div key={action} className="contents">
                  <dt className="text-fg-primary">{action}</dt>
                  <dd className="flex gap-1">
                    {platformKeys(keys).map((key) => (
                      <kbd
                        key={key}
                        className="min-w-5 rounded-sm border border-subtle bg-panel px-1 text-center text-small text-fg-secondary"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-small text-fg-secondary">
          To print them, or to see how anything works,{" "}
          <a
            href={helpAddress("reference/keyboard-shortcuts")}
            target="_blank"
            rel="noopener"
            className="rounded-sm text-accent-solid underline decoration-accent-solid/40 underline-offset-3 focus-ring hover:decoration-accent-solid"
          >
            open Help<span className="sr-only">, in a new tab</span>
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

// The shortcut reference (DS-78): `?` or the account menu's "Keyboard shortcuts" opens it, listing the shortcuts
// that work now. Shortcuts arriving with later issues join the list with them.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";

import { shortcutReference } from "./shortcuts";

export function ShortcutReference({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
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
                    {keys.map((key) => (
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
      </DialogContent>
    </Dialog>
  );
}

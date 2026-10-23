// Toasts (DS-108): Base UI's toast. Sonner, which DS-20 first named, injects its stylesheet as a `<style>` element
// without the CSP nonce, so the CSP would block it (TS-101). Bottom-right on the toast layer 80 (DS-18), styled
// like the other floating layers, at most 3 shown; timers pause on hover and focus, and F6 reaches them. A toast
// carries its actions as data, so it can offer more than one. High-priority toasts are announced assertively
// (DS-83). Features raise toasts through a `notifier`, which holds DS-108's kinds: information for 4 s, undo for
// 8 s, and problems (failures, conflicts, anything needing a decision) until closed.

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CircleAlert, TriangleAlert, X } from "lucide-react";
import type * as React from "react";

import { Button } from "@tonaris/ui/components/button";

export type ToastAction = { label: string; onClick: () => void };

/** What a Tonaris toast carries besides its title and description. */
export type ToastData = {
  /** `danger` for failures, `warning` for conflicts; each adds its icon, so status is never color only. */
  tone?: "danger" | "warning";
  actions?: ToastAction[];
};

export type ToastManager = ReturnType<typeof createToastManager>;

/** A manager to add and close toasts from anywhere; give it to the `Toaster`. */
export function createToastManager() {
  return ToastPrimitive.createToastManager<ToastData>();
}

/** How long each kind of toast stays, in ms (DS-108). Problems stay until closed. */
export const toastTimeouts = { info: 4_000, undo: 8_000 } as const;

export type Notifier = ReturnType<typeof notifier>;

/** DS-108's kinds of toast, each with its duration and priority, raised through `manager`. */
export function notifier(manager: Pick<ToastManager, "add" | "close">) {
  return {
    /**
     * Something worth knowing that needs nothing: gone after 4 s. An optional action offers a shortcut, such as
     * "Switch to manual order"; taking it closes the toast.
     */
    info(title: string, description?: string, action?: ToastAction): string {
      const id: string = manager.add({
        title,
        ...(description === undefined ? {} : { description }),
        timeout: toastTimeouts.info,
        priority: "low",
        ...(action === undefined
          ? {}
          : {
              data: {
                actions: [
                  {
                    label: action.label,
                    onClick: () => {
                      action.onClick();
                      manager.close(id);
                    },
                  },
                ],
              },
            }),
      });
      return id;
    },
    /** A reversible action done: **Undo** for 8 s, which undoes it and closes the toast (DS-50). */
    undo({ title, onUndo }: { title: string; onUndo: () => void }): string {
      const id: string = manager.add({
        title,
        timeout: toastTimeouts.undo,
        priority: "low",
        data: {
          actions: [
            {
              label: "Undo",
              onClick: () => {
                onUndo();
                manager.close(id);
              },
            },
          ],
        },
      });
      return id;
    },
    /**
     * A failure, a conflict or anything needing a decision: it stays until closed, and is announced assertively.
     * What it reports must also be in Activity, so closing it loses nothing.
     */
    problem({
      id,
      title,
      description,
      tone,
      actions,
    }: {
      id: string;
      title: string;
      description: string;
      tone: NonNullable<ToastData["tone"]>;
      actions: ToastAction[];
    }): string {
      return manager.add({
        id,
        title,
        description,
        timeout: 0,
        priority: "high",
        data: { tone, actions },
      });
    },
    close(id: string): void {
      manager.close(id);
    },
  };
}

/** Renders its children with the toasts `manager` adds, in the bottom-right viewport. */
export function Toaster({
  manager,
  children,
}: {
  manager: ToastManager;
  children: React.ReactNode;
}) {
  return (
    <ToastPrimitive.Provider toastManager={manager} limit={3}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toaster"
          className="fixed right-4 bottom-4 z-80 flex w-[calc(100vw-2rem)] max-w-sm flex-col-reverse gap-2 outline-none"
        >
          <Toasts />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

const toneIcons = {
  danger: <CircleAlert strokeWidth={1.5} className="size-4 text-status-danger" aria-hidden />,
  warning: <TriangleAlert strokeWidth={1.5} className="size-4 text-status-warning" aria-hidden />,
};

function Toasts() {
  const { toasts } = ToastPrimitive.useToastManager<ToastData>();
  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className="rounded-lg bg-raised p-3 text-fg-primary shadow-floating transition-opacity duration-150 ease-enter data-ending-style:opacity-0 data-limited:hidden data-starting-style:opacity-0"
    >
      <ToastPrimitive.Content className="flex items-start gap-2.5">
        {toast.data?.tone && <span className="mt-0.5 shrink-0">{toneIcons[toast.data.tone]}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastPrimitive.Title className="font-medium text-fg-primary" />
          <ToastPrimitive.Description className="text-small text-fg-secondary" />
          {toast.data?.actions && (
            <div className="mt-2 flex gap-2">
              {toast.data.actions.map((action) => (
                <Button key={action.label} size="sm" onClick={action.onClick}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <ToastPrimitive.Close
          aria-label="Close"
          render={<Button variant="ghost" size="icon-sm" className="-mt-0.5 -mr-1" />}
        >
          <X strokeWidth={1.5} aria-hidden />
        </ToastPrimitive.Close>
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}

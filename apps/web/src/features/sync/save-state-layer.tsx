// What the workspace says about saving (DS-80 to DS-83), around everything it shows:
// - a persistent toast when a write fails or meets a newer value, with Retry or Review;
// - the conflict review;
// - the announcer, and the assertive announcement when the workspace goes offline.
// Writes that were already failed or in conflict when the page loaded raise no toast: the SyncIndicator counts
// them and Activity lists them. Resolving a write anywhere closes its toast; closing the toast keeps it in Activity.

import type { SyncClient } from "@/client/sync/client";
import { resubmit } from "@/client/sync/resubmit";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { OutcomeStatus } from "@tonaris/domain";
import { createToastManager, Toaster, type ToastManager } from "@tonaris/ui/components/toast";

import { Announcer, useAnnounce } from "./announcer";
import { ConflictView } from "./conflict-view";
import { describeWrite, reasonOf } from "./describe";
import { namesOf, SaveActionsContext, type SaveActions } from "./save-actions";
import { useConnection, useSyncClient } from "./sync-provider";

export function SaveStateLayer({ children }: { children: ReactNode }) {
  const [toasts] = useState(createToastManager);
  return (
    <Toaster manager={toasts}>
      <Announcer>
        <Feedback toasts={toasts}>{children}</Feedback>
      </Announcer>
    </Toaster>
  );
}

function Feedback({ toasts, children }: { toasts: ToastManager; children: ReactNode }) {
  const client = useSyncClient();
  const [reviewing, setReviewing] = useState<string>();

  const actions = useMemo<SaveActions | undefined>(() => {
    if (!client) return undefined;
    return {
      review: setReviewing,
      resubmit(state) {
        const result = resubmit(client, state);
        if (result === "gone") {
          toasts.update(state.mutation.mutationId, {
            description: "It no longer exists, so it can't be saved again.",
            data: { tone: "danger" },
          });
        } else toasts.close(state.mutation.mutationId);
        return result;
      },
      dismiss(state) {
        client.states.dismiss(state.mutation.mutationId);
        toasts.close(state.mutation.mutationId);
      },
    };
  }, [client, toasts]);

  useSettledToasts(client, actions, toasts);
  useOfflineAnnouncement();

  const state = reviewing === undefined ? undefined : client?.states.get(reviewing);
  return (
    <SaveActionsContext value={actions}>
      {children}
      <ConflictView
        state={state?.status === "conflict" ? state : undefined}
        onClose={() => setReviewing(undefined)}
      />
    </SaveActionsContext>
  );
}

/** States a write passes through before its outcome: one that reaches a failure or a conflict from them raises a toast. */
const underway = new Set<OutcomeStatus>(["pending", "unconfirmed"]);

/** Raises a persistent toast when one of this page's writes fails or meets a newer value (DS-80, DS-108). */
function useSettledToasts(
  client: SyncClient | undefined,
  actions: SaveActions | undefined,
  toasts: ToastManager,
): void {
  useEffect(() => {
    if (!client || !actions) return undefined;
    const seen = new Map<string, OutcomeStatus>();
    return client.states.subscribe((state) => {
      const id = state.mutation.mutationId;
      const before = seen.get(id);
      if (underway.has(state.status)) {
        seen.set(id, state.status);
        return;
      }
      seen.delete(id);
      if (!before || !underway.has(before)) return;
      const { what, subject } = describeWrite(state.mutation, namesOf(client));
      if (state.status === "failed") {
        toasts.add({
          id,
          title: `Couldn't save ${what}`,
          description: reasonOf(state.outcome),
          timeout: 0,
          priority: "high",
          data: {
            tone: "danger",
            actions: [{ label: "Retry", onClick: () => actions.resubmit(state) }],
          },
        });
      } else if (state.status === "conflict") {
        toasts.add({
          id,
          title: `${subject} changed while you were editing`,
          description: "Your change wasn't saved. Review both versions to choose.",
          timeout: 0,
          priority: "high",
          data: {
            tone: "warning",
            actions: [{ label: "Review", onClick: () => actions.review(id) }],
          },
        });
      }
    });
  }, [client, actions, toasts]);
}

/** Says assertively that the workspace went offline (DS-83). */
function useOfflineAnnouncement(): void {
  const connection = useConnection();
  const announce = useAnnounce();
  const previous = useRef(connection);
  useEffect(() => {
    if (connection === "offline" && previous.current !== "offline") {
      announce("You're offline. Changes can't be saved until the connection is back.", "assertive");
    }
    previous.current = connection;
  }, [connection, announce]);
}

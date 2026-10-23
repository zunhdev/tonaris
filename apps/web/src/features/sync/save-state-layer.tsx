// What the workspace says about saving (DS-80 to DS-84, DS-108), around everything it shows:
// - a persistent toast when a write made on its own fails or meets a newer value, with Retry or Review;
// - one persistent toast when a batch settles with anything not saved, with View report, which opens Activity at
//   its report; a batch that saves wholly is announced politely instead;
// - the conflict review, and Activity's open state;
// - the announcer, and the assertive announcement when the workspace goes offline.
// Writes and reports that were already settled when the page loaded raise nothing: the SyncIndicator counts them and
// Activity lists them. Resolving a write or a report anywhere closes its toast; closing the toast keeps it in
// Activity.

import type { SyncClient } from "@/client/sync/client";
import { resubmit, resubmitAll } from "@/client/sync/resubmit";
import { formOf } from "@/features/collection/album-form";
import { useCollectionUi, useMode, useStartEditor } from "@/features/collection/collection-ui";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { OutcomeStatus } from "@tonaris/domain";
import { createToastManager, notifier, Toaster, type Notifier } from "@tonaris/ui/components/toast";

import { ActivityContext, type ActivityControl } from "./activity";
import { Announcer, useAnnounce } from "./announcer";
import { ConflictView } from "./conflict-view";
import { describeWrite, reasonOf } from "./describe";
import { NotifyContext } from "./notify";
import { retryTargets, summarize, underway, unsaved } from "./report";
import { namesOf, SaveActionsContext, type SaveActions } from "./save-actions";
import { useConnection, useSyncClient } from "./sync-provider";

export function SaveStateLayer({ children }: { children: ReactNode }) {
  const [toasts] = useState(createToastManager);
  const notify = useMemo(() => notifier(toasts), [toasts]);
  return (
    <Toaster manager={toasts}>
      <NotifyContext value={notify}>
        <Announcer>
          <Feedback notify={notify}>{children}</Feedback>
        </Announcer>
      </NotifyContext>
    </Toaster>
  );
}

function Feedback({ notify, children }: { notify: Notifier; children: ReactNode }) {
  const client = useSyncClient();
  const startEditor = useStartEditor();
  const { enterEditing } = useMode();
  const { startNewAlbum } = useCollectionUi();
  const [reviewing, setReviewing] = useState<string>();
  const [activityOpen, setActivityOpen] = useState(false);
  const [shownReport, setShownReport] = useState<string>();

  const showReport = useCallback((report: string) => {
    setShownReport(report);
    setActivityOpen(true);
  }, []);
  const activity = useMemo<ActivityControl>(
    () => ({
      open: activityOpen,
      report: shownReport,
      setOpen: (open) => {
        setActivityOpen(open);
        if (!open) setShownReport(undefined);
      },
      show: showReport,
    }),
    [activityOpen, shownReport, showReport],
  );

  const actions = useMemo<SaveActions | undefined>(() => {
    if (!client) return undefined;
    return {
      review: setReviewing,
      resubmit(state) {
        // A write of a batch is made again into its report.
        const result =
          state.batch === undefined
            ? resubmit(client, state)
            : client.states.within(state.batch, () => resubmit(client, state));
        if (result === "gone") {
          notify.problem({
            id: state.mutation.mutationId,
            title: `Couldn't save ${describeWrite(state.mutation, namesOf(client)).what}`,
            description: "It no longer exists, so it can't be saved again.",
            tone: "danger",
            actions: [],
          });
        } else notify.close(state.mutation.mutationId);
        return result;
      },
      dismiss(state) {
        client.states.dismiss(state.mutation.mutationId);
        notify.close(state.mutation.mutationId);
      },
      retry(report, ids) {
        const targets = retryTargets(report, ids);
        const results = client.states.within(report.id, () => resubmitAll(client, targets));
        return ids.map((id) => {
          const index = targets.findIndex((target) => target.mutation.mutationId === id);
          return results[index] ?? "unchanged";
        });
      },
      dismissReport(report) {
        client.states.dismissReport(report.id);
      },
      canEdit({ status, mutation }) {
        if (status !== "failed") return false;
        if (mutation.name === "album.create") return true;
        if (mutation.name === "container.rename") return client.containers.has(mutation.args.id);
        if (mutation.name !== "container.create") return false;
        const { parentId } = mutation.args;
        return parentId === null || client.containers.has(parentId);
      },
      edit({ mutation }) {
        const replaces = mutation.mutationId;
        if (mutation.name === "container.create") {
          const { kind, parentId, name } = mutation.args;
          startEditor({ mode: "create", kind, parentId, name, replaces });
        } else if (mutation.name === "container.rename") {
          startEditor({ mode: "rename", id: mutation.args.id, name: mutation.args.name, replaces });
        } else if (mutation.name === "album.create") {
          // The form opens as it was entered, with the list its entry was going to (DS-47, AC-08).
          const album = mutation.args;
          const entry = client.states
            .open()
            .find(
              (state) =>
                state.mutation.name === "membership.add" &&
                state.mutation.args.albumId === album.id,
            );
          const listId =
            entry?.mutation.name === "membership.add" ? entry.mutation.args.listId : null;
          enterEditing();
          startNewAlbum({
            form: formOf(album, listId),
            replaces: entry ? [replaces, entry.mutation.mutationId] : [replaces],
          });
        }
      },
    };
  }, [client, notify, startEditor, enterEditing, startNewAlbum]);

  useSettledToasts(client, actions, notify);
  useReportFeedback(client, notify, showReport);
  useOfflineAnnouncement();

  const state = reviewing === undefined ? undefined : client?.states.get(reviewing);
  return (
    <SaveActionsContext value={actions}>
      <ActivityContext value={activity}>
        {children}
        <ConflictView
          state={state?.status === "conflict" ? state : undefined}
          onClose={() => setReviewing(undefined)}
        />
      </ActivityContext>
    </SaveActionsContext>
  );
}

/** States a write passes through before its outcome: one that reaches a failure or a conflict from them raises a toast. */
const underwayStatuses = new Set<OutcomeStatus>(["pending", "unconfirmed"]);

/**
 * Raises a persistent toast when one of this page's writes made on its own fails or meets a newer value (DS-80,
 * DS-108). A batch's writes are reported by their batch.
 */
function useSettledToasts(
  client: SyncClient | undefined,
  actions: SaveActions | undefined,
  notify: Notifier,
): void {
  useEffect(() => {
    if (!client || !actions) return undefined;
    const seen = new Map<string, OutcomeStatus>();
    return client.states.subscribe((state) => {
      const id = state.mutation.mutationId;
      const before = seen.get(id);
      // Batches' writes too: one still underway when its report is dismissed goes on, and is reported, on its own.
      if (underwayStatuses.has(state.status)) {
        seen.set(id, state.status);
        return;
      }
      seen.delete(id);
      if (state.batch !== undefined || !before || !underwayStatuses.has(before)) return;
      const { what, subject } = describeWrite(state.mutation, namesOf(client));
      if (state.status === "failed") {
        notify.problem({
          id,
          title: `Couldn't save ${what}`,
          description: reasonOf(state.outcome),
          tone: "danger",
          actions: [
            { label: "Retry", onClick: () => actions.resubmit(state) },
            ...(actions.canEdit(state)
              ? [{ label: "Edit", onClick: () => actions.edit(state) }]
              : []),
          ],
        });
      } else if (state.status === "conflict") {
        notify.problem({
          id,
          title: `${subject} changed while you were editing`,
          description: "Your change wasn't saved. Review both versions to choose.",
          tone: "warning",
          actions: [{ label: "Review", onClick: () => actions.review(id) }],
        });
      }
    });
  }, [client, actions, notify]);
}

const changes = (n: number) => (n === 1 ? "1 change" : `${n} changes`);

/**
 * One toast for a batch of this page's that settles with anything not saved, and a polite announcement for one that
 * saves wholly (DS-83, DS-84, DS-108). The toast closes once nothing settled in the report is left unsaved: retried,
 * reviewed or dismissed.
 */
function useReportFeedback(
  client: SyncClient | undefined,
  notify: Notifier,
  showReport: (id: string) => void,
): void {
  const announce = useAnnounce();

  useEffect(() => {
    if (!client) return undefined;
    /** The reports seen underway, by ID. */
    const running = new Set<string>();
    /** The reports with a toast open; a toast's ID is its report's. */
    const toasts = new Set<string>();
    return client.states.onReport((report, closed) => {
      const wasUnderway = running.has(report.id);
      const isUnderway = underway(report);
      if (isUnderway && !closed) running.add(report.id);
      else running.delete(report.id);
      const problems = unsaved(report);

      if (toasts.has(report.id) && (closed || problems.length === 0)) {
        notify.close(report.id);
        toasts.delete(report.id);
      }
      if (!wasUnderway || isUnderway) return;
      if (problems.length === 0) {
        announce(`${changes(report.items.length)} saved.`);
        return;
      }
      const total = report.items.length;
      toasts.add(report.id);
      // Raised again after a retry that didn't save it all, the open toast is updated.
      notify.problem({
        id: report.id,
        title:
          problems.length === total
            ? `Couldn't save ${changes(total)}`
            : `Couldn't save ${problems.length} of ${changes(total)}`,
        description: summarize(report),
        tone: problems.some((item) => item.status === "failed") ? "danger" : "warning",
        actions: [{ label: "View report", onClick: () => showReport(report.id) }],
      });
    });
  }, [client, notify, announce, showReport]);
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

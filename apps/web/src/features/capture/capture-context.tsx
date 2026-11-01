// The capture interface's shared state (DS-48, TON-45): the capture dialog; starting captures, from it or from a paste
// anywhere in the workspace; what a single capture's outcome says; and the links capture kept instead of the pasted
// ones, which the inspector offers to replace (FR-06.4). Capturing is an edit: it switches to Editing first and waits
// while offline (DS-45, DS-81).

import type { SaveState } from "@/client/sync/writer";
import { useCollectionUi, useMode } from "@/features/collection/collection-ui";
import { useInspector } from "@/features/collection/inspector-state";
import { useNarrowScreen } from "@/features/shell/media";
import { inLayer, isTextField } from "@/features/shell/shortcuts";
import { useAnnounce } from "@/features/sync/announcer";
import { reasonOf } from "@/features/sync/describe";
import { useNotify } from "@/features/sync/notify";
import { useSaveActions } from "@/features/sync/save-actions";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { maxBatchItems, type OutcomeStatus, type StreamingService } from "@tonaris/domain";

import { linksIn } from "./links-in";
import {
  captureNeed,
  captureResult,
  confirmedToast,
  failedTitle,
  keptLinkToast,
  needReason,
  needTitle,
} from "./outcomes";

/** A link capture kept on an album instead of the pasted one, for the inspector to offer (FR-06.4). */
export type KeptLink = { albumId: string; service: StreamingService; kept: string; pasted: string };

type CaptureUi = {
  /** The capture dialog, while it is open: its destination list, or null for none. */
  dialog: { listId: string | null } | undefined;
  /** Opens the capture dialog for the list on view, switching to Editing first; waits while offline. */
  openDialog: () => void;
  closeDialog: () => void;
  /** Captures `links` into `listId`, switching to Editing first; answers whether they went. */
  capture: (links: readonly string[], listId: string | null) => boolean;
  /** The links kept instead of pasted ones, in this tab, until replaced or dismissed. */
  keptLinks: readonly KeptLink[];
  forgetKeptLink: (albumId: string, service: StreamingService) => void;
};

const CaptureContext = createContext<CaptureUi | undefined>(undefined);

export function useCapture(): CaptureUi | undefined {
  return useContext(CaptureContext);
}

/** The list on view, if a list is: where pasted links go (DS-48). */
function useViewListId(): string | null {
  return useParams({ strict: false }).listId ?? null;
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const client = useSyncClient();
  const notify = useNotify();
  const { enterEditing } = useMode();
  const offline = useConnection() === "offline";
  const listId = useViewListId();
  const [dialog, setDialog] = useState<{ listId: string | null } | undefined>(undefined);
  const [keptLinks, setKeptLinks] = useState<readonly KeptLink[]>([]);

  const capture = useCallback(
    (links: readonly string[], into: string | null) => {
      if (!client || offline || links.length === 0) return false;
      // At most one batch at once (TS-25).
      if (links.length > maxBatchItems) {
        notify?.info(`Add up to ${maxBatchItems} links at once.`);
        return false;
      }
      enterEditing();
      client.captures.send(links.map((link) => ({ link, listId: into })));
      return true;
    },
    [client, offline, notify, enterEditing],
  );

  const value = useMemo<CaptureUi>(
    () => ({
      dialog,
      openDialog: () => {
        if (offline) return;
        enterEditing();
        setDialog({ listId });
      },
      closeDialog: () => setDialog(undefined),
      capture,
      keptLinks,
      forgetKeptLink: (albumId, service) =>
        setKeptLinks((current) =>
          current.filter((link) => link.albumId !== albumId || link.service !== service),
        ),
    }),
    [dialog, offline, enterEditing, listId, capture, keptLinks],
  );

  usePasteCapture(capture, listId);
  useCaptureFeedback((link) =>
    setKeptLinks((current) => [
      ...current.filter((each) => each.albumId !== link.albumId || each.service !== link.service),
      link,
    ]),
  );

  return <CaptureContext value={value}>{children}</CaptureContext>;
}

/**
 * ⌘V anywhere in the workspace, on desktop, with no text field focused and no dialog, popover or menu open: the
 * pasted lines that look like links are captured into the list on view, else into none (DS-48, DS-78).
 */
function usePasteCapture(
  capture: (links: readonly string[], listId: string | null) => boolean,
  listId: string | null,
): void {
  const narrow = useNarrowScreen();
  const latest = useRef({ capture, listId, narrow });
  useEffect(() => {
    latest.current = { capture, listId, narrow };
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const now = latest.current;
      const target = event.target ?? document.activeElement;
      if (now.narrow || isTextField(target) || inLayer(target)) return;
      if (isTextField(document.activeElement) || inLayer(document.activeElement)) return;
      const links = linksIn(event.clipboardData?.getData("text/plain") ?? "");
      if (links.length === 0) return;
      event.preventDefault();
      now.capture(links, now.listId);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
}

const underway = new Set<OutcomeStatus>(["pending", "unconfirmed"]);

/**
 * What a single capture's outcome says (DS-48): a toast for its result, a failure or a choice, and the announcement
 * of a new album. A batch's captures are reported by their report and panel instead. A kept link is remembered for
 * the inspector either way. A toast about a capture closes once the capture is retried, completed or dismissed.
 */
function useCaptureFeedback(keep: (link: KeptLink) => void): void {
  const client = useSyncClient();
  const notify = useNotify();
  const actions = useSaveActions();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const { startAddToList } = useCollectionUi();
  const { enterEditing } = useMode();
  const viewListId = useViewListId();
  const pathname = useLocation({ select: (location) => location.pathname });
  const inspector = useInspector();
  // The latest of each, so the subscription stays across mode switches, which a capture itself makes.
  const latest = useRef({
    keep,
    viewListId,
    pathname,
    navigate,
    startAddToList,
    enterEditing,
    inspect: inspector.open,
    notify,
    actions,
    announce,
  });
  useEffect(() => {
    latest.current = {
      keep,
      viewListId,
      pathname,
      navigate,
      startAddToList,
      enterEditing,
      inspect: inspector.open,
      notify,
      actions,
      announce,
    };
  });

  useEffect(() => {
    if (!client) return undefined;
    const seen = new Set<string>();
    /** The captures with a toast open: a toast's ID is its capture's. */
    const toasts = new Set<string>();
    const closeGone = () => {
      const { notify: toaster } = latest.current;
      for (const id of toasts) {
        const state = client.states.get(id);
        if (state && (state.status === "failed" || state.status === "needs_input")) continue;
        toaster?.close(id);
        toasts.delete(id);
      }
    };
    const unsubscribeChanges = client.states.onChange(closeGone);

    function shown(listId: string | null): boolean {
      const { viewListId: onView, pathname: path } = latest.current;
      return listId === null ? path === "/unsorted" : onView === listId;
    }

    function confirmed(state: SaveState): void {
      if (state.mutation.name !== "album.capture") return;
      const result = captureResult(state.outcome);
      if (!result || !client) return;
      const now = latest.current;
      const { notify: toaster, announce: say } = now;
      if (result.keptLink) now.keep({ albumId: result.albumId, ...result.keptLink });
      if (state.batch !== undefined) return;
      const { listId } = state.mutation.args;
      const title = client.albums.get(result.albumId)?.title ?? "the album";
      const toast = confirmedToast(result, {
        title,
        listName: listId === null ? null : (client.containers.get(listId)?.name ?? "the list"),
        shown: shown(listId),
      });
      if (result.match === "created") say(`Added ${title}`);
      if (result.alreadyInList) client.elsewhere.highlight(result.albumId);
      if (toast && toaster) {
        toaster.info(
          toast.title,
          undefined,
          toast.addToList
            ? {
                label: "Add to list…",
                onClick: () => {
                  now.enterEditing();
                  now.startAddToList(result.albumId);
                },
              }
            : undefined,
        );
      }
      if (result.keptLink && toaster) {
        toaster.info(keptLinkToast(result.keptLink), undefined, {
          label: "Review",
          onClick: () => now.inspect(result.albumId),
        });
      }
    }

    function unsaved(state: SaveState): void {
      if (state.mutation.name !== "album.capture" || state.batch !== undefined) return;
      const { notify: toaster, actions: act } = latest.current;
      if (!toaster || !act) return;
      const id = state.mutation.mutationId;
      const { listId } = state.mutation.args;
      if (state.status === "failed") {
        toasts.add(id);
        toaster.problem({
          id,
          title: failedTitle,
          description: reasonOf(state.outcome),
          tone: "danger",
          actions: [
            { label: "Retry", onClick: () => act.resubmit(state) },
            { label: "Enter manually", onClick: () => act.edit(state) },
          ],
        });
        return;
      }
      const need = captureNeed(state.outcome);
      if (!need) return;
      toasts.add(id);
      toaster.problem({
        id,
        title: needTitle(need),
        description: needReason(state.outcome) ?? "",
        tone: "warning",
        actions: [
          need.need === "match"
            ? {
                label: "Decide",
                // The choice is in its row, in the view it goes to.
                onClick: () =>
                  void latest.current.navigate(
                    listId === null
                      ? { to: "/unsorted" }
                      : { to: "/l/$listId", params: { listId } },
                  ),
              }
            : { label: "Enter manually", onClick: () => act.edit(state) },
        ],
      });
    }

    const unsubscribe = client.states.subscribe((state) => {
      const id = state.mutation.mutationId;
      if (underway.has(state.status)) {
        seen.add(id);
        return;
      }
      if (!seen.delete(id)) return;
      if (state.status === "confirmed") confirmed(state);
      else unsaved(state);
    });
    return () => {
      unsubscribe();
      unsubscribeChanges();
    };
  }, [client]);
}

// The description panel (DS-41; FR-03.5, TON-292): a folder's or list's description, written where the album panel
// opens, in Editing mode on a computer. Description in the view's header opens it, as a click on the description does.
// Its text box takes the panel's height, under buttons for the Markdown's marks (⌘B and ⌘I too), with a count of the
// 2,000 characters. The description under the header shows what is typed meanwhile, through a small store, so the
// shell doesn't render again on every key.
//
// Closing saves: Done, ⌘↵, Esc and Close, unless the text is over the limit, when the panel stays with its reason.
// Leaving Editing mode saves it as it does an inline editor, and stays in Editing mode while the text is over the
// limit. Another page, or an album opening in its place, closes it, saving as it goes. The panel shares the album
// panel's slot, width and slide (shell.tsx), so one closes the other.

import { sent } from "@/client/sync/writer";
import { useNarrowScreen } from "@/common/media";
import { inLayer, isTextField, keysLabel, ariaShortcut } from "@/common/shortcuts";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useLocation } from "@tanstack/react-router";
import { Bold, Italic, Link, List, ListOrdered, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import {
  descriptionProblem,
  maxDescriptionLength,
  textLength,
  type Container,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Field } from "@tonaris/ui/components/field";
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@tonaris/ui/components/tooltip";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionMode, useMode } from "./collection-mode";
import { useCollectionData } from "./data";
import { markEdit, type Mark } from "./description-marks";
import { SidePanel, type InspectorPlacement } from "./inspector";
import { useInspector } from "./inspector-state";

/** The text being typed, and whose description it is. */
type Draft = { containerId: string; text: string };

function createDrafts() {
  let current: Draft | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: Draft | undefined) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type DescriptionPanelControl = {
  /** The folder or list whose description the panel writes, while it is open. */
  containerId: string | undefined;
  /** Opens it for a folder or list, closing the album panel. */
  open: (containerId: string) => void;
  /** Closes it; the panel saves as it goes. */
  close: () => void;
  drafts: ReturnType<typeof createDrafts>;
};

export const DescriptionPanelContext = createContext<DescriptionPanelControl | undefined>(
  undefined,
);

/** The panel's state, for the shell to hold and provide. */
export function useDescriptionPanelState(): DescriptionPanelControl {
  const [containerId, setContainerId] = useState<string>();
  const [drafts] = useState(createDrafts);
  const { albumId, close: closeAlbum } = useInspector();
  const { editing } = useMode();
  const narrow = useNarrowScreen();
  const pathname = useLocation({ select: (location) => location.pathname });
  const live = editing && !narrow;
  // What closes it: leaving Editing mode, a phone's screen, another page, or an album opened in its place.
  const [seen, setSeen] = useState({ live, pathname, albumId });
  if (seen.live !== live || seen.pathname !== pathname || seen.albumId !== albumId) {
    const closes =
      !live || seen.pathname !== pathname || (albumId !== undefined && albumId !== seen.albumId);
    setSeen({ live, pathname, albumId });
    if (closes && containerId !== undefined) setContainerId(undefined);
  }
  const open = useCallback(
    (id: string) => {
      if (albumId !== undefined) closeAlbum();
      setContainerId(id);
    },
    [albumId, closeAlbum],
  );
  const close = useCallback(() => setContainerId(undefined), []);
  return useMemo(
    () => ({ containerId: live ? containerId : undefined, open, close, drafts }),
    [live, containerId, open, close, drafts],
  );
}

export function useDescriptionPanel(): DescriptionPanelControl {
  const control = useContext(DescriptionPanelContext);
  if (!control) throw new Error("useDescriptionPanel() needs the shell.");
  return control;
}

/** What is being typed for this folder's or list's description, while the panel writes it. */
export function useDescriptionDraft(containerId: string): string | undefined {
  const { drafts } = useDescriptionPanel();
  return useSyncExternalStore(
    drafts.subscribe,
    () => {
      const draft = drafts.get();
      return draft?.containerId === containerId ? draft.text : undefined;
    },
    () => undefined,
  );
}

/** The panel, in the album panel's slot (shell.tsx). */
export function DescriptionPanel({
  ref,
  containerId,
  closing,
  placement,
  width,
  onResize,
}: {
  ref: Ref<HTMLElement>;
  /** The folder or list described: the panel's, or, while it slides out, the one it wrote. */
  containerId: string;
  closing: boolean;
  placement: InspectorPlacement;
  width: number;
  onResize: (width: number) => void;
}) {
  const { tree, ready } = useCollectionData();
  const { close } = useDescriptionPanel();
  const container = tree.byId.get(containerId);
  // What Close does: the editor's finish, which saves first, once it has one.
  const finishing = useRef<() => void>(close);
  const onFinish = useCallback((finish: () => void) => {
    finishing.current = finish;
  }, []);
  return (
    <SidePanel
      ref={ref}
      label="Description"
      detail={container?.name}
      closing={closing}
      placement={placement}
      width={width}
      onResize={onResize}
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close description"
          onClick={() => finishing.current()}
        >
          <X aria-hidden strokeWidth={1.5} />
        </Button>
      }
    >
      {container ? (
        <DescriptionEditor
          key={container.id}
          container={container}
          closing={closing}
          onFinish={onFinish}
        />
      ) : (
        ready && <p className="p-4 text-fg-secondary">This folder or list isn't available.</p>
      )}
    </SidePanel>
  );
}

const marks: { mark: Mark; label: string; icon: ReactNode; keys?: string[] }[] = [
  { mark: "bold", label: "Bold", icon: <Bold aria-hidden strokeWidth={1.5} />, keys: ["⌘", "B"] },
  {
    mark: "italic",
    label: "Italic",
    icon: <Italic aria-hidden strokeWidth={1.5} />,
    keys: ["⌘", "I"],
  },
  { mark: "link", label: "Link", icon: <Link aria-hidden strokeWidth={1.5} /> },
  { mark: "bullets", label: "Bulleted list", icon: <List aria-hidden strokeWidth={1.5} /> },
  { mark: "numbers", label: "Numbered list", icon: <ListOrdered aria-hidden strokeWidth={1.5} /> },
];

function DescriptionEditor({
  container,
  closing,
  onFinish,
}: {
  container: Container;
  closing: boolean;
  /** Gives the panel's Close button what closing does. */
  onFinish: (finish: () => void) => void;
}) {
  const client = useSyncClient();
  const { close, drafts } = useDescriptionPanel();
  const { registerEditor } = useCollectionMode();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(container.description ?? "");
  const [refusal, setRefusal] = useState<string>();
  // What commit reads, from wherever it is called, unmounting included.
  const latest = useRef({ text, container, client });
  useLayoutEffect(() => {
    latest.current = { text, container, client };
  });
  // The description last saved from here: what saving again would send nothing for.
  const saved = useRef(container.description);

  /** Saves the text, or shows why it can't be saved; whether it could. */
  const commit = useCallback((): boolean => {
    const { text: typed, container: described, client: writer } = latest.current;
    const trimmed = typed.trim();
    const reason = descriptionProblem(trimmed)?.problem.detail;
    if (reason !== undefined) {
      setRefusal(reason);
      return false;
    }
    const next = trimmed === "" ? null : trimmed;
    if (next !== saved.current && writer) {
      saved.current = next;
      sent(
        writer.containers.update(described.id, (row) => {
          row.description = next;
        }),
      );
    }
    return true;
  }, []);

  const finish = useCallback(() => {
    if (commit()) close();
    else field.current?.focus();
  }, [commit, close]);
  useLayoutEffect(() => {
    onFinish(finish);
  }, [onFinish, finish]);

  // The description under the header follows the typing.
  useLayoutEffect(() => {
    drafts.set({ containerId: container.id, text });
  }, [drafts, container.id, text]);
  // Closed from elsewhere, it saves as it slides out; unmounted, it has saved, and the saved text shows again.
  useEffect(() => {
    if (closing) commit();
  }, [closing, commit]);
  useEffect(
    () => () => {
      commit();
      drafts.set(undefined);
    },
    [commit, drafts],
  );
  // Leaving Editing mode saves it, and stays while it can't be saved (DS-45).
  useEffect(
    () =>
      registerEditor(() => {
        const saves = commit();
        if (!saves) field.current?.focus();
        return saves;
      }),
    [registerEditor, commit],
  );
  // Open, it takes the focus, at the end of the text.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  // Esc outside a field, a dialog or a menu closes it, as it does the album panel.
  useEffect(() => {
    if (closing) return undefined;
    const onWindowKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isTextField(event.target) || inLayer(event.target)) return;
      finish();
    };
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [closing, finish]);

  /** Adds a mark, or takes it off, as one edit the browser's Undo takes back. */
  function applyMark(mark: Mark) {
    const element = field.current;
    if (!element) return;
    const edit = markEdit(element.value, element.selectionStart, element.selectionEnd, mark);
    element.focus();
    element.setSelectionRange(edit.from, edit.to);
    // The one way to edit a text box that its Undo can take back.
    if (!document.execCommand("insertText", false, edit.insert))
      element.setRangeText(edit.insert, edit.from, edit.to, "end");
    setText(element.value);
    setRefusal(undefined);
    element.setSelectionRange(...edit.select);
  }

  function onTextKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (command && !event.shiftKey && !event.altKey && (key === "b" || key === "i")) {
      event.preventDefault();
      applyMark(key === "b" ? "bold" : "italic");
      return;
    }
    if (event.key === "Escape" || (command && event.key === "Enter")) {
      event.preventDefault();
      event.stopPropagation();
      finish();
    }
  }

  const length = textLength(text.trim());
  return (
    <>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex shrink-0 items-center gap-0.5 border-b border-subtle px-2 py-1.5"
      >
        {marks.map(({ mark, label, icon, keys }) => (
          <Tooltip key={mark}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={label}
                  aria-keyshortcuts={keys ? ariaShortcut(`Meta+${keys[1]}`) : undefined}
                  // The text box keeps the focus and its selection.
                  onMouseDown={(event) => event.preventDefault()}
                />
              }
              onClick={() => applyMark(mark)}
            >
              {icon}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {label}
              {keys && <TooltipShortcut>{keysLabel(keys)}</TooltipShortcut>}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <Field
        label="Description"
        hideLabel
        problem={refusal}
        className="min-h-0 flex-1 gap-0 [&>p]:px-4 [&>p]:pb-2"
      >
        {(control) => (
          <textarea
            ref={field}
            {...control}
            value={text}
            placeholder="Add a description"
            onChange={(event) => {
              setText(event.target.value);
              setRefusal(undefined);
            }}
            onKeyDown={onTextKey}
            // The panel is the text box: its caret shows the focus, with no frame around the panel's height.
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-fg-primary outline-none placeholder:text-fg-tertiary"
          />
        )}
      </Field>
      <div className="flex shrink-0 items-center gap-3 border-t border-subtle py-2 pr-2 pl-4">
        <span
          className={cn(
            "text-small tabular-nums",
            length > maxDescriptionLength
              ? "text-status-danger"
              : length > 1_800
                ? "text-status-warning"
                : "text-fg-tertiary",
          )}
        >
          {length.toLocaleString("en")} / {maxDescriptionLength.toLocaleString("en")}
        </span>
        <Button
          variant="primary"
          aria-keyshortcuts={ariaShortcut("Meta+Enter")}
          className="ml-auto"
          onClick={finish}
        >
          Done
        </Button>
      </div>
    </>
  );
}

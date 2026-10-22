// The workspace's keyboard shortcuts (DS-78), as a pure matcher from key presses to actions, so their rules are
// tested without a DOM. G starts a sequence: G then H, U, T or S within 1.5 s goes to the root, Unsorted, Trash or
// Settings. Single keys: `[` hides or shows the sidebar, `?` opens the reference, N and ⇧N make a new list or folder.
// Nothing matches while a text field has focus, nor with ⌘, Ctrl or Alt held. Shortcuts come before the tree's
// type-ahead (decided 22 October 2026): a matched key is claimed, and the tree types ahead only with the others.

export type ShortcutAction =
  | "go-root"
  | "go-unsorted"
  | "go-trash"
  | "go-settings"
  | "toggle-sidebar"
  | "shortcuts"
  | "new-list"
  | "new-folder";

/** What the matcher reads of a `KeyboardEvent`. */
export type KeyPress = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  target: unknown;
  /** In ms. */
  timeStamp: number;
};

/** Whether keys typed at `target` are text: an input, a textarea, a select or an editable element (DS-78). */
export function isTextField(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  if ("isContentEditable" in target && target.isContentEditable === true) return true;
  const tag = "tagName" in target && typeof target.tagName === "string" ? target.tagName : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const goTo: Record<string, ShortcutAction> = {
  h: "go-root",
  u: "go-unsorted",
  t: "go-trash",
  s: "go-settings",
};

const singles: Record<string, ShortcutAction> = {
  "[": "toggle-sidebar",
  "?": "shortcuts",
  n: "new-list",
  N: "new-folder",
};

/**
 * What a key press does: an action, `pending` when it opens a G sequence, or nothing. Both an action and `pending`
 * claim the key, so the tree doesn't also type ahead with it.
 */
export type ShortcutMatcher = (press: KeyPress) => ShortcutAction | "pending" | undefined;

export function createShortcutMatcher({ sequenceMs = 1_500 } = {}): ShortcutMatcher {
  /** When G was pressed, while its sequence is open. */
  let started: number | undefined;
  return (press) => {
    if (press.repeat || press.altKey || press.ctrlKey || press.metaKey) return undefined;
    if (isTextField(press.target)) {
      started = undefined;
      return undefined;
    }
    if (started !== undefined && press.timeStamp - started <= sequenceMs) {
      started = undefined;
      return goTo[press.key.toLowerCase()];
    }
    started = undefined;
    if (press.key === "g") {
      started = press.timeStamp;
      return "pending";
    }
    return singles[press.key];
  };
}

/** The shortcuts that work now, for the reference (DS-78). Grouped as the reference shows them. */
export const shortcutReference = [
  {
    title: "Moving around",
    keys: [
      { keys: ["↑", "↓"], action: "Move in the sidebar or a view" },
      { keys: ["J", "K"], action: "Next or previous row in a view" },
      { keys: ["←", "→"], action: "Collapse or expand a folder; move across a row" },
      { keys: ["⌘", "Home"], action: "First item in a view" },
      { keys: ["⌘", "End"], action: "Last item in a view" },
      { keys: ["Enter"], action: "Open" },
      { keys: ["G", "H"], action: "Go to Collection" },
      { keys: ["G", "U"], action: "Go to Unsorted" },
      { keys: ["G", "T"], action: "Go to Trash" },
      { keys: ["G", "S"], action: "Go to Settings" },
      { keys: ["["], action: "Hide or show the sidebar" },
    ],
  },
  {
    title: "Folders and lists",
    keys: [
      { keys: ["N"], action: "New list" },
      { keys: ["⇧", "N"], action: "New folder" },
      { keys: ["F2"], action: "Rename" },
    ],
  },
  { title: "Help", keys: [{ keys: ["?"], action: "Keyboard shortcuts" }] },
] as const;

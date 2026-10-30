// The workspace's keyboard shortcuts (DS-78), as a pure matcher from key presses to actions, so their rules are
// tested without a DOM. G starts a sequence: G then H, U, T or S within 1.5 s goes to the root, Unsorted, Trash or
// Settings → Preferences. Single keys: `[` hides or shows the sidebar, `?` opens the reference, N and ⇧N make a new
// list or folder, V opens the view's View options, M moves the focused folder or list, E switches between Viewing
// and Editing mode, L adds the open or focused album to a list, ⇧S shares the focused or viewed folder or list (DS-65),
// C opens the capture dialog (DS-48), and O opens the
// open or focused album's "Open in…" chooser (DS-25). ⌫ deletes the focused folder or list, and ⌘⌫ the open or
// focused album (DS-50). ⌘K, or Ctrl+K, opens the search palette (DS-75), also from a text field. Esc closing the
// inspector is the inspector's.
// Nothing else matches while a text field has focus, nor with ⌘, Ctrl or Alt held. Shortcuts come before the tree's
// type-ahead (decided 22 October 2026): a matched key is claimed, and the tree types ahead only with the others.

export type ShortcutAction =
  | "go-root"
  | "go-unsorted"
  | "go-trash"
  | "go-settings"
  | "toggle-sidebar"
  | "shortcuts"
  | "new-list"
  | "new-folder"
  | "view-options"
  | "move"
  | "toggle-mode"
  | "add-to-list"
  | "capture"
  | "open-in"
  | "delete"
  | "delete-album"
  | "share"
  | "search";

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

/** Whether `target` is inside a layer with keys of its own: a dialog, a popover or a menu. */
export function inLayer(target: unknown): boolean {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !==
      null
  );
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
  S: "share",
  v: "view-options",
  m: "move",
  e: "toggle-mode",
  l: "add-to-list",
  c: "capture",
  o: "open-in",
  // ⌫: Backspace, or Delete on keyboards that have it (DS-78).
  Backspace: "delete",
  Delete: "delete",
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
    // ⌘K (Ctrl+K elsewhere) searches from anywhere, a text field included (DS-78).
    if (
      !press.repeat &&
      !press.altKey &&
      (press.metaKey || press.ctrlKey) &&
      press.key.toLowerCase() === "k"
    ) {
      started = undefined;
      return "search";
    }
    // ⌘⌫ (Ctrl+⌫ elsewhere) deletes an album from the collection (DS-50), the one combination with a modifier.
    if (
      !press.repeat &&
      !press.altKey &&
      (press.metaKey || press.ctrlKey) &&
      (press.key === "Backspace" || press.key === "Delete") &&
      !isTextField(press.target)
    ) {
      return "delete-album";
    }
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

/** What the palette runs (DS-75): every action shortcut, and F2 and R, which act where they are pressed. */
export type CommandId = Exclude<ShortcutAction, "search"> | "rename" | "restore";

type Section = "Moving around" | "Views" | "Albums" | "Folders and lists" | "Trash" | "Help";

export type Command = {
  id: CommandId;
  /** Its name in the reference, and in the palette unless it has a label of its own there. */
  title: string;
  keys: readonly string[];
  section: Section;
};

/**
 * Every action shortcut, as a palette command and a reference entry (DS-75, DS-78): one list, so the two can't
 * drift. Pure navigation keys are the reference's alone (decided with the creator, 29 October 2026).
 */
export const commands: readonly Command[] = [
  { id: "go-root", title: "Go to Collection", keys: ["G", "H"], section: "Moving around" },
  { id: "go-unsorted", title: "Go to Unsorted", keys: ["G", "U"], section: "Moving around" },
  { id: "go-trash", title: "Go to Trash", keys: ["G", "T"], section: "Moving around" },
  { id: "go-settings", title: "Go to Settings", keys: ["G", "S"], section: "Moving around" },
  {
    id: "toggle-sidebar",
    title: "Hide or show the sidebar",
    keys: ["["],
    section: "Moving around",
  },
  {
    id: "toggle-mode",
    title: "Switch between viewing and editing",
    keys: ["E"],
    section: "Views",
  },
  { id: "view-options", title: "View options", keys: ["V"], section: "Views" },
  { id: "capture", title: "Add albums from links", keys: ["C"], section: "Albums" },
  { id: "add-to-list", title: "Add to list…", keys: ["L"], section: "Albums" },
  { id: "open-in", title: "Open in…", keys: ["O"], section: "Albums" },
  {
    id: "delete-album",
    title: "Delete an album from the collection",
    keys: ["⌘", "⌫"],
    section: "Albums",
  },
  { id: "new-list", title: "New list", keys: ["N"], section: "Folders and lists" },
  { id: "new-folder", title: "New folder", keys: ["⇧", "N"], section: "Folders and lists" },
  { id: "rename", title: "Rename", keys: ["F2"], section: "Folders and lists" },
  { id: "move", title: "Move to…", keys: ["M"], section: "Folders and lists" },
  { id: "share", title: "Share…", keys: ["⇧", "S"], section: "Folders and lists" },
  { id: "delete", title: "Delete a folder or list", keys: ["⌫"], section: "Folders and lists" },
  { id: "restore", title: "Restore", keys: ["R"], section: "Trash" },
  { id: "shortcuts", title: "Keyboard shortcuts", keys: ["?"], section: "Help" },
];

export const commandsById: ReadonlyMap<CommandId, Command> = new Map(
  commands.map((command) => [command.id, command]),
);

/** The palette's frequent commands before there is any history (decided with the creator, 29 October 2026). */
export const starterCommands: readonly CommandId[] = [
  "capture",
  "new-list",
  "go-unsorted",
  "toggle-mode",
  "shortcuts",
];

/** The `count` commands run most from the palette, ties in list order, then the starter set to fill (DS-75). */
export function frequentCommands(
  uses: Readonly<Record<string, number>>,
  count = starterCommands.length,
): CommandId[] {
  const used = commands
    .filter(({ id }) => (uses[id] ?? 0) > 0)
    .toSorted((a, b) => (uses[b.id] ?? 0) - (uses[a.id] ?? 0))
    .map(({ id }) => id);
  return [...new Set([...used, ...starterCommands])].slice(0, count);
}

type ReferenceEntry = { keys: readonly string[]; action: string };

/** Keys that move or confirm rather than act: the reference lists them, the palette doesn't. */
const navigation: Partial<Record<Section, readonly ReferenceEntry[]>> = {
  "Moving around": [
    { keys: ["⌘", "K"], action: "Search" },
    { keys: ["↑", "↓"], action: "Move in the sidebar or a view" },
    { keys: ["J", "K"], action: "Next or previous row in a view" },
    { keys: ["←", "→"], action: "Collapse or expand a folder; move across a row" },
    { keys: ["⇧", "F10"], action: "Open a folder's or list's menu in the sidebar" },
    { keys: ["⌘", "Home"], action: "First item in a view" },
    { keys: ["⌘", "End"], action: "Last item in a view" },
    { keys: ["Enter"], action: "Open; open an album in the inspector" },
    { keys: ["⌘", "Enter"], action: "Submit a form; in search, open an album on its own" },
    { keys: ["Esc"], action: "Close the inspector" },
  ],
  Views: [
    { keys: ["⌥", "↑"], action: "Move up, in manual order" },
    { keys: ["⌥", "↓"], action: "Move down, in manual order" },
    { keys: ["⌥", "⇧", "↑"], action: "Move to the top" },
    { keys: ["⌥", "⇧", "↓"], action: "Move to the bottom" },
  ],
};

const sections: readonly Section[] = [
  "Moving around",
  "Views",
  "Albums",
  "Folders and lists",
  "Trash",
  "Help",
];

/** Every shortcut, for the reference (DS-78): each section's navigation keys, then its commands. */
export const shortcutReference: readonly { title: Section; keys: readonly ReferenceEntry[] }[] =
  sections.map((title) => ({
    title,
    keys: [
      ...(navigation[title] ?? []),
      ...commands
        .filter((command) => command.section === title)
        .map(({ keys, title: action }) => ({ keys, action })),
    ],
  }));

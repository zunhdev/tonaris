// Keys in Help (FR-16.2, DS-122): every step that has a key names it beside the mouse action, as the person's
// computer labels it. The server renders a Mac's keys, as it can't know the computer; the browser then shows
// Ctrl, Alt, Shift and Backspace off Apple's. Screen readers hear each key's name, not its symbol.

import { isApplePlatform } from "@/common/shortcuts";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Whether keys show as on a Mac: true on the server and while hydrating, then the device's own answer. */
export function useApple(): boolean {
  return useSyncExternalStore(subscribe, isApplePlatform, () => true);
}

const offApple: Record<string, string> = {
  "⌘": "Ctrl",
  "⌥": "Alt",
  "⇧": "Shift",
  "⌫": "Backspace",
};

const spoken: Record<string, [mac: string, other: string]> = {
  "⌘": ["Command", "Control"],
  "⌥": ["Option", "Alt"],
  "⇧": ["Shift", "Shift"],
  "⌫": ["Delete", "Backspace"],
  "↑": ["Up arrow", "Up arrow"],
  "↓": ["Down arrow", "Down arrow"],
  "←": ["Left arrow", "Left arrow"],
  "→": ["Right arrow", "Right arrow"],
  "?": ["Question mark", "Question mark"],
  "[": ["Left bracket", "Left bracket"],
};

/** A key as shown on this kind of computer. */
export function keyLabel(key: string, apple: boolean): string {
  return apple ? key : (offApple[key] ?? key);
}

/** A key as a screen reader should say it. */
export function keyName(key: string, apple: boolean): string {
  const names = spoken[key];
  return names ? names[apple ? 0 : 1] : key;
}

const capClass =
  "inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-sm border border-b-2 border-subtle bg-raised px-1.5 align-[1px] font-sans text-small font-medium text-fg-primary";

/** One keypress, such as `k="⌘ K"`: keys pressed together, separated by spaces. */
export function Keys({ k }: { k: string }) {
  const apple = useApple();
  const keys = k.split(" ").filter(Boolean);
  return (
    <kbd className="inline-flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden className="contents">
        {keys.map((key) => (
          <kbd key={key} className={capClass}>
            {keyLabel(key, apple)}
          </kbd>
        ))}
      </span>
      <span className="sr-only">{keys.map((key) => keyName(key, apple)).join(" ")}</span>
    </kbd>
  );
}

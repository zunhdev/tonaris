// The keyboard shortcuts cheatsheet (FR-16.2, DS-122, the creator's pick 6A): every key the app's `?` sheet lists,
// from the same list (common/shortcuts.ts), so a new key shows here by itself. The keys to learn first come before
// the groups; a switch shows them for a Mac or for Windows and Linux, starting from the reader's computer; Print
// gives a one-sheet copy.

import { shortcutReference } from "@/common/shortcuts";
import { Printer } from "lucide-react";
import { useState } from "react";

import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { keyLabel, keyName, useApple } from "./keys";

const capClass =
  "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-b-2 border-subtle bg-raised px-1.5 text-small font-semibold text-fg-primary";

/** The keys to learn first, by the keys the app gives them. */
const firstKeys = ["⌘ K", "C", "L", "O", "E", "N", "Esc", "?"];

const modifiers = new Set(["⌘", "⌥", "⇧"]);

/**
 * How an entry's keys go together, as the `?` sheet lists them: with a modifier they're pressed together (⌘ K); the
 * Go to keys are pressed one after the other (G then H); any other pair is either key (↑ or ↓, J or K).
 */
function joinerOf(keys: readonly string[], action: string): "" | "then" | "or" {
  if (keys.length < 2 || keys.some((key) => modifiers.has(key))) return "";
  return action.startsWith("Go to") ? "then" : "or";
}

function KeyCaps({
  keys,
  action,
  apple,
  large = false,
}: {
  keys: readonly string[];
  action: string;
  apple: boolean;
  large?: boolean;
}) {
  const joiner = joinerOf(keys, action);
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span aria-hidden className="contents">
        {keys.map((key, index) => (
          <span key={key} className="contents">
            {joiner && index > 0 && <span className="text-small text-fg-tertiary">{joiner}</span>}
            <kbd className={large ? `${capClass} h-9 min-w-9 px-2.5 text-base` : capClass}>
              {keyLabel(key, apple)}
            </kbd>
          </span>
        ))}
      </span>
      <span className="sr-only">
        {keys.map((key) => keyName(key, apple)).join(joiner ? ` ${joiner} ` : " ")}
      </span>
    </span>
  );
}

const platforms = [
  { value: "mac", label: "Mac" },
  { value: "other", label: "Windows and Linux" },
] as const;

/**
 * Mac or Windows and Linux, as native radios the server can render: the design system's segmented control sets
 * `style` attributes, which the CSP refuses in server-rendered HTML (TS-101). The arrows switch, as in any radio group.
 */
function KeysFor({
  apple,
  onChoose,
}: {
  apple: boolean;
  onChoose: (value: "mac" | "other") => void;
}) {
  const chosen = apple ? "mac" : "other";
  return (
    <fieldset className="m-0 flex rounded-md border-0 bg-raised p-0.5">
      <legend className="sr-only">Keys for</legend>
      {platforms.map(({ value, label }) => (
        <label
          key={value}
          className={cn(
            "flex h-8 cursor-pointer items-center rounded-sm px-3 text-base has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-focus",
            chosen === value
              ? "bg-hover text-fg-primary"
              : "text-fg-secondary hover:text-fg-primary",
          )}
        >
          <input
            type="radio"
            name="keys-for"
            value={value}
            checked={chosen === value}
            onChange={() => onChoose(value)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function Shortcuts() {
  const own = useApple();
  const [chosen, setChosen] = useState<"mac" | "other">();
  const apple = chosen ? chosen === "mac" : own;
  const entries = shortcutReference.flatMap((group) => group.keys);
  const first = firstKeys.flatMap(
    (keys) => entries.find((entry) => entry.keys.join(" ") === keys) ?? [],
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <KeysFor apple={apple} onChoose={setChosen} />
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden strokeWidth={1.5} />
          Print
        </Button>
      </div>

      <section aria-labelledby="first-keys" className="flex flex-col gap-3">
        <h2
          id="first-keys"
          className="text-small font-medium tracking-[0.06em] text-fg-tertiary uppercase"
        >
          Learn these first
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {first.map(({ keys, action }) => (
            <li
              key={action}
              className="flex items-center gap-4 rounded-lg border border-subtle bg-panel px-4 py-3"
            >
              <KeyCaps keys={keys} action={action} apple={apple} large />
              <span className="text-base text-fg-secondary">{action}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2 print:grid-cols-2">
        {shortcutReference.map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="flex flex-col rounded-xl border border-subtle bg-panel px-5 py-4 print:break-inside-avoid"
          >
            <h2 className="mb-2 text-title text-fg-primary">{group.title}</h2>
            <dl className="flex flex-col">
              {group.keys.map(({ keys, action }) => (
                <div
                  key={action}
                  className="flex items-center justify-between gap-4 border-t border-subtle py-2"
                >
                  <dt className="text-base text-fg-secondary">{action}</dt>
                  <dd className="m-0">
                    {keys.length > 0 ? (
                      <KeyCaps keys={keys} action={action} apple={apple} />
                    ) : (
                      <span className="text-small text-fg-tertiary">
                        No key; find it with {keyLabel("⌘", apple)}K
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

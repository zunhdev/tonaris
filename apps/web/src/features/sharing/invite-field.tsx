// The sharing dialog's invite field (DS-65; FR-07.4, FR-07.23; TON-294): an address typed as before, or one of the
// owner's people picked from what it suggests. A combobox, as "Find a list" is (DS-115): while it has the focus, its
// options show under it, the 8 most recently shared with before anything is typed, then the people the typed words
// find. ↑ and ↓ move through them; Enter or a click invites the active one at once, with the role beside the field.
// Before typing, nothing is active, so Enter invites nothing; while typing, the first match is. With no person
// active, Enter or Invite invites the address typed. Escape closes the options, then the dialog.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles, as the finder's are: the
// field keeps the focus and its keys, so the options take none.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { count } from "@/common/words";
import { Avatar } from "@/features/account/avatar";
import { Marked } from "@/features/collection/finder";
import { matchLimit, termsOf } from "@/features/collection/list-picker";
import { useSend } from "@/features/sharing/send";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { uuidv7, type Person, type ShareRole } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

import {
  clashingNames,
  findPeople,
  personChoices,
  suggestedPeople,
  type PersonChoice,
} from "./people-picker";
import { RolePicker } from "./role-picker";

export function InviteField({
  containerId,
  people,
  invited,
  disabled,
  onInvited,
}: {
  containerId: string;
  /** The owner's people; undefined until read. */
  people: readonly Person[] | undefined;
  /** The people with an open invitation here, who aren't offered. */
  invited: readonly string[];
  disabled: boolean;
  onInvited: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  // Can view unless the owner picks Can edit (FR-07.18); kept for the next invitation.
  const [role, setRole] = useState<ShareRole>("view");
  const [open, setOpen] = useState(false);
  // -1: none, as before anything is typed, so Enter invites the address typed.
  const [active, setActive] = useState(-1);
  const { run, busy, error, setError } = useSend();

  const choices = useMemo(() => personChoices(people ?? [], invited), [people, invited]);
  const terms = useMemo(() => termsOf(text), [text]);
  const typed = terms.length > 0;
  const suggested = useMemo(() => suggestedPeople(choices), [choices]);
  const found = useMemo(() => findPeople(choices, text), [choices, text]);
  const shown = typed ? found.shown : suggested.shown;
  const clashes = useMemo(() => clashingNames(shown), [shown]);
  const activeAt = active >= shown.length ? shown.length - 1 : active;
  const activeChoice = activeAt >= 0 ? shown[activeAt] : undefined;
  const listed = open && !disabled && shown.length > 0;

  const note = typed
    ? found.total > matchLimit
      ? `Showing ${matchLimit} of ${found.total}. Keep typing to narrow them down.`
      : undefined
    : suggested.hidden > 0
      ? `Type to find ${count(suggested.hidden, "more person", "more people")}.`
      : undefined;

  async function invite(args: { email: string } | { personId: string }) {
    const reason = await run({
      name: "share.invite",
      args: { grantId: uuidv7(), containerId, role, ...args },
    });
    if (reason === undefined) {
      setText("");
      setActive(-1);
      onInvited();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (listed && activeChoice) {
      void invite({ personId: activeChoice.person.id });
      return;
    }
    if (text.trim() === "") return;
    void invite({ email: text });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && shown.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive(
        activeAt < 0
          ? step > 0
            ? 0
            : shown.length - 1
          : (activeAt + step + shown.length) % shown.length,
      );
    } else if (event.key === "Escape" && listed) {
      // Closing the options is the field's: the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="email"
          role="combobox"
          aria-label="Invite by name or email"
          aria-expanded={listed}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={
            listed && activeChoice ? `${id}-${activeChoice.person.id}` : undefined
          }
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          autoComplete="off"
          spellCheck={false}
          placeholder="Invite by name or email…"
          value={text}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setOpen(true);
            // Typing makes the first match active; cleared, nothing is.
            setActive(termsOf(next).length > 0 ? 0 : -1);
            setError(undefined);
          }}
          onKeyDown={onKeyDown}
        />
        <RolePicker
          role={role}
          label="Role for the invitation"
          disabled={disabled || busy}
          onChange={setRole}
        />
        <Button type="submit" disabled={disabled || busy}>
          Invite
        </Button>
      </div>
      <div
        id={`${id}-options`}
        role="listbox"
        aria-label="Your people"
        className={cn(
          "flex max-h-72 flex-col overflow-y-auto rounded-md border border-subtle p-1",
          !listed && "hidden",
        )}
      >
        {!typed && (
          <div aria-hidden className="px-2 pt-1 pb-1 text-small font-medium text-fg-tertiary">
            Recent
          </div>
        )}
        {shown.map((choice, at) => (
          <PersonOption
            key={choice.person.id}
            id={`${id}-${choice.person.id}`}
            choice={choice}
            terms={terms}
            clash={clashes.has(choice.name)}
            active={at === activeAt}
            onPoint={() => setActive(at)}
            onChoose={() => void invite({ personId: choice.person.id })}
          />
        ))}
        {note && <p className="px-2 pt-1 text-small text-fg-tertiary">{note}</p>}
      </div>
      <output className="sr-only">
        {listed && typed ? count(found.total, "person found", "people found") : ""}
      </output>
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * A person to invite: their avatar and name, then the address the owner typed for them; or, for someone who invited
 * the owner, nothing more, unless another shows the same name: then one of their shares (FR-07.3, FR-07.23).
 */
function PersonOption({
  id,
  choice,
  terms,
  clash,
  active,
  onPoint,
  onChoose,
}: {
  id: string;
  choice: PersonChoice;
  terms: readonly string[];
  clash: boolean;
  active: boolean;
  onPoint: () => void;
  onChoose: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  // The active option stays in view as ↑ and ↓ move through them.
  useEffect(() => {
    if (active) node.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const { person, name } = choice;
  return (
    // The field keeps the focus, and its keys reach every option (DS-115).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      ref={node}
      id={id}
      role="option"
      aria-selected={active}
      onPointerMove={onPoint}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      className={cn(
        "flex h-8 shrink-0 cursor-default items-center gap-2 rounded-md px-2 text-fg-primary",
        active && "bg-hover",
      )}
    >
      <Avatar name={name} className="size-5 text-[11px]" />
      <span className="min-w-0 flex-1 truncate">
        <Marked text={name} terms={terms} />
        {person.displayName !== null && person.email !== null && (
          <span className="ml-2 text-fg-secondary">
            <Marked text={person.email} terms={terms} />
          </span>
        )}
        {person.email === null && clash && person.sharesWithYou !== null && (
          <span className="text-fg-secondary"> · shares "{person.sharesWithYou}" with you</span>
        )}
      </span>
    </div>
  );
}

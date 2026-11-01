// An inline editor's draft (DS-45, DS-82): what is typed, held apart from the saved value, so that a change from
// elsewhere never replaces it. Enter commits it, as leaving the field does and as leaving Editing mode does, which
// waits while a refused value stays with its reason and nothing is sent (X-05). Escape discards it. Each editor
// brings its own check and save; this holds the draft, the refusal and the registration with Editing mode.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { useCollectionUi } from "./collection-ui";

/** What a key does to a draft: commit it, discard it, or nothing, leaving the key to the field and the page. */
export function draftKeyAction(
  key: Pick<KeyboardEvent, "key" | "shiftKey">,
  { multiline, escape, open }: { multiline: boolean; escape: "always" | "open"; open: boolean },
): "commit" | "discard" | undefined {
  // Over several lines, Shift+Enter adds one.
  if (key.key === "Enter" && !(multiline && key.shiftKey)) return "commit";
  if (key.key === "Escape" && (escape === "always" || open)) return "discard";
  return undefined;
}

export function useInlineDraft<Field extends HTMLInputElement | HTMLTextAreaElement>({
  value,
  check,
  save,
  multiline = false,
  opensOn = "focus",
  escape = "always",
  register = true,
  onClose,
}: {
  /** The saved text, shown while nothing is typed. */
  value: string;
  /** Why `typed` can't be saved, if it can't. */
  check: (typed: string) => string | undefined;
  /** Saves `typed`, which `check` passed; sending nothing for an unchanged value is the editor's to decide. */
  save: (typed: string) => void;
  /** Text over several lines: Shift+Enter adds one, and Enter commits. */
  multiline?: boolean;
  /**
   * When the draft opens: on focus, so a change from elsewhere no longer replaces what the field shows (DS-82), or
   * with the first keystroke, so the field shows the saved value until then.
   */
  opensOn?: "focus" | "typing";
  /**
   * Whether Escape is the field's whenever it has the focus (`always`), or only while a draft is open (`open`), so
   * that after a commit it goes on to the page.
   */
  escape?: "always" | "open";
  /** Whether leaving Editing mode commits it (DS-45); Settings, which has no mode, says no. */
  register?: boolean;
  /**
   * For an editor opened to type into, as Add and Replace open a link's: it starts open with `value`, and a commit or
   * Escape closes it through `onClose`. Without it, focusing the field opens the draft, and those end it.
   */
  onClose?: () => void;
}) {
  const { registerEditor } = useCollectionUi();
  const field = useRef<Field>(null);
  const [draft, setDraftState] = useState<string | undefined>(
    onClose === undefined ? undefined : value,
  );
  const [refusal, setRefusal] = useState<string>();
  // What the handlers read: the draft as typed, whether the editor closed, and the editor's latest rules.
  const current = useRef(draft);
  const closed = useRef(false);
  const latest = useRef({ check, save, onClose });
  useEffect(() => {
    latest.current = { check, save, onClose };
  });
  const setDraft = useCallback((next: string | undefined) => {
    current.current = next;
    setDraftState(next);
  }, []);

  /** Ends the draft unsaved: the saved value shows again, or the editor opened for it closes. */
  const discard = useCallback(() => {
    setRefusal(undefined);
    const close = latest.current.onClose;
    if (close === undefined) setDraft(undefined);
    else if (!closed.current) {
      closed.current = true;
      close();
    }
  }, [setDraft]);

  /** Saves the draft, or shows why it can't be saved; whether nothing is left open. */
  const commit = useCallback((): boolean => {
    const typed = current.current;
    if (typed === undefined || closed.current) return true;
    const reason = latest.current.check(typed);
    if (reason !== undefined) {
      setRefusal(reason);
      return false;
    }
    latest.current.save(typed);
    discard();
    return true;
  }, [discard]);

  const open = draft !== undefined;
  useEffect(() => {
    if (!open || !register) return undefined;
    return registerEditor(() => {
      const done = commit();
      if (!done) field.current?.focus();
      return done;
    });
  }, [open, register, registerEditor, commit]);

  return {
    /** What the field shows: the draft, or the saved value. */
    text: draft ?? value,
    /** Why the draft can't be saved, while it can't. */
    refusal,
    commit,
    discard,
    /** The field's own props, to spread onto its input or textarea. */
    props: {
      ref: field,
      value: draft ?? value,
      onFocus: () => {
        if (opensOn === "focus" && current.current === undefined) setDraft(value);
      },
      onChange: (event: ChangeEvent<Field>) => {
        setDraft(event.target.value);
        setRefusal(undefined);
      },
      onKeyDown: (event: KeyboardEvent<Field>) => {
        const action = draftKeyAction(event, {
          multiline,
          escape,
          open: current.current !== undefined,
        });
        if (action === undefined) return;
        event.preventDefault();
        if (action === "commit") {
          commit();
          return;
        }
        // Discarding is the field's: the inspector or dialog around it stays open.
        event.stopPropagation();
        discard();
      },
      onBlur: () => {
        commit();
      },
    },
  };
}

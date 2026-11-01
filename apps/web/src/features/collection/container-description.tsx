// A folder's or list's description under its header (DS-41; FR-03.5): plain text, its line breaks kept. Viewing mode
// shows it, or nothing without one. Editing mode makes it a text box, "Add a description" when empty: Enter or leaving
// it saves, Shift+Enter adds a line, Escape reverts, and leaving Editing mode saves it too (DS-45). Emptied, it is
// cleared. Over 2,000 characters it stays with its reason (X-05).

import { sent } from "@/client/sync/writer";
import { useSyncClient } from "@/features/sync/sync-provider";

import { descriptionProblem, type Container } from "@tonaris/domain";
import { Field } from "@tonaris/ui/components/field";

import { useMode } from "./collection-ui";
import { useInlineDraft } from "./inline-draft";

export function ContainerDescription({ container }: { container: Container }) {
  const { editing } = useMode();
  if (editing) return <DescriptionEditor key={container.id} container={container} />;
  if (!container.description) return null;
  return (
    <p className="max-h-24 shrink-0 overflow-y-auto px-6 pt-3 whitespace-pre-line text-fg-secondary">
      {container.description}
    </p>
  );
}

function DescriptionEditor({ container }: { container: Container }) {
  const client = useSyncClient();
  const {
    text: shown,
    refusal: problem,
    props,
  } = useInlineDraft<HTMLTextAreaElement>({
    value: container.description ?? "",
    check: (typed) => descriptionProblem(typed.trim())?.problem.detail,
    save: (typed) => {
      const text = typed.trim();
      const next = text === "" ? null : text;
      if (next === container.description || !client) return;
      sent(
        client.containers.update(container.id, (row) => {
          row.description = next;
        }),
      );
    },
    multiline: true,
    // Once saved, Escape is the page's again.
    escape: "open",
  });

  return (
    <Field label="Description" hideLabel problem={problem} className="shrink-0 gap-1 px-6 pt-3">
      {(control) => (
        // Text under the header, not a form's box: it shows its edge only on hover and focus.
        <textarea
          {...props}
          {...control}
          placeholder="Add a description"
          rows={Math.min(6, Math.max(1, shown.split("\n").length))}
          className="-mx-2 max-w-3xl resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-fg-secondary outline-none placeholder:text-fg-tertiary hover:border-subtle focus-visible:border-strong focus-visible:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid aria-invalid:border-status-danger"
        />
      )}
    </Field>
  );
}

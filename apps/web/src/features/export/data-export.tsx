// "Download your data" (DS-96; FR-08.1–FR-08.6): what the archive holds and leaves out, and the button with its
// states: preparing, ready with "Download again", or failed with the reason and Retry. Settings → Data shows it,
// and the account-deletion dialog embeds the button as "Download your data first" (DS-97). On the desktop only, as
// FR-08.1 asks.

import { useNarrowScreen } from "@/features/collection/collection-ui";
import { useId } from "react";

import { Button } from "@tonaris/ui/components/button";

import { save, startExport, useExportState } from "./export-state";

const included = [
  "Every album, including Unsorted and Trash",
  "Your folders and lists, with their descriptions",
  "Custom fields and their values",
  "Your arrangements and view choices",
];

const excluded = [
  "Your sign-in email and display name",
  "Sharing: invitations, people and links",
  "Shared with me, and what others own",
  "AI connections",
  "Artwork images (their addresses are included)",
];

/** The button and its states, for Settings → Data and the account-deletion dialog. */
export function ExportButton() {
  const id = useId();
  const state = useExportState();
  const narrow = useNarrowScreen();
  if (narrow)
    return <p className="text-fg-secondary">Downloading your data is on the desktop app.</p>;

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        className="self-start"
        disabled={state.status === "preparing"}
        aria-describedby={state.status === "idle" ? undefined : `${id}-state`}
        onClick={() => void startExport()}
      >
        Download your data
      </Button>
      <div id={`${id}-state`} aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {state.status === "preparing" && (
          <>
            <progress
              aria-label="Preparing your export"
              className="w-full max-w-sm accent-accent-fill"
            />
            <p className="text-fg-secondary">Preparing your export…</p>
          </>
        )}
        {state.status === "ready" && (
          <p className="text-fg-secondary">
            Your export is downloading as {state.fileName}.{" "}
            <button
              type="button"
              className="text-accent-solid underline-offset-4 hover:underline"
              onClick={() => save(state.url, state.fileName)}
            >
              Download again
            </button>
          </p>
        )}
        {state.status === "failed" && (
          <>
            <p role="alert" className="text-status-danger">
              {state.reason}
            </p>
            <Button className="self-start" onClick={() => void startExport()}>
              Retry
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Settings → Data's export section (DS-96). */
export function DataExport() {
  return (
    <section aria-labelledby="export" className="flex flex-col gap-3">
      <h2 id="export" className="text-title text-fg-primary">
        Download your data
      </h2>
      <p className="text-fg-secondary">
        A ZIP with a JSON file (complete, for programs and AI tools), a Markdown file (readable
        outline of your collection) and a README.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-fg-primary">Included</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-fg-secondary">
            {included.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-fg-primary">Not included</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-fg-secondary">
            {excluded.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <ExportButton />
    </section>
  );
}

// The decision card (DS-48, as TS-44 shapes it; FR-02.9, FR-02.10): a capture whose link fits several albums asks
// "Which album is this?". Each candidate is a MusicBrainz album, marked "In your collection" with its artist and year
// when the owner already has it. Choosing one sends the capture again as that album; "None of these" opens manual
// entry, which saves it unidentified with the link; "Decide later" folds the card, leaving the capture pending while
// the rest goes on. Nothing is applied until the person chooses.

import type { SaveState } from "@/client/sync/save-states";
import { cellText } from "@/features/collection/album-edit";
import { useCollectionData } from "@/features/collection/data";
import { useAnnounce } from "@/features/sync/announcer";
import { useSaveActions } from "@/features/sync/save-actions";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useId, useState } from "react";

import { Button } from "@tonaris/ui/components/button";

import { captureNeed } from "./outcomes";

export function DecisionCard({
  state,
  folded: startFolded = false,
}: {
  state: SaveState;
  /** Shown as one line with Decide, as in Activity and the report, until opened. */
  folded?: boolean;
}) {
  const client = useSyncClient();
  const actions = useSaveActions();
  const announce = useAnnounce();
  const offline = useConnection() === "offline";
  const { albumsById } = useCollectionData();
  const [folded, setFolded] = useState(startFolded);
  const id = useId();
  const need = captureNeed(state.outcome);
  if (need?.need !== "match" || state.mutation.name !== "album.capture") return null;

  if (folded) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-fg-secondary">Fits more than one album.</span>
        <Button size="sm" onClick={() => setFolded(false)}>
          Decide
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`${id}-question`}
      data-slot="decision-card"
      className="flex flex-col gap-2 rounded-md border border-subtle bg-raised p-3"
    >
      <h3 id={`${id}-question`} className="font-medium text-fg-primary">
        Which album is this?
      </h3>
      <ul className="flex flex-col gap-1.5">
        {need.candidates.map((candidate) => {
          const saved = candidate.albumId === null ? undefined : albumsById.get(candidate.albumId);
          return (
            <li key={candidate.releaseGroupId} className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={offline}
                onClick={() => {
                  client?.captures.again(state, { releaseGroupId: candidate.releaseGroupId });
                  announce(`Adding ${candidate.title}`);
                }}
              >
                {candidate.title}
              </Button>
              {candidate.albumId !== null && (
                <span className="text-small text-fg-secondary">
                  In your collection
                  {saved && ` · ${saved.artistCredit}, ${cellText(saved, "originalYear") || "—"}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={offline}
          onClick={() => actions?.edit(state)}
        >
          None of these
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setFolded(true)}>
          Decide later
        </Button>
      </div>
    </section>
  );
}

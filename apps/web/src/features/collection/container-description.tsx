// A folder's or list's description under its header (DS-41; FR-03.5, TON-292): its Markdown rendered, three lines and
// More, at the top of the view's scroll area, so it scrolls away with the albums or the folders and lists. Nothing
// shows without one. It is written in the description panel (description-panel.tsx): in Editing mode, a click on it
// opens the panel, as Description in the header does, and while the panel is open it shows what is typed.

import { useNarrowScreen } from "@/common/media";
import { useConnection } from "@/features/sync/sync-provider";
import type { MouseEvent } from "react";

import type { Container } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { useMode } from "./collection-mode";
import { useDescriptionDraft, useDescriptionPanel } from "./description-panel";
import { DescriptionText } from "./description-text";

export function ContainerDescription({ container }: { container: Container }) {
  const draft = useDescriptionDraft(container.id);
  const text = draft ?? container.description ?? "";
  const { editing } = useMode();
  const { open } = useDescriptionPanel();
  const offline = useConnection() === "offline";
  const narrow = useNarrowScreen();
  if (text.trim() === "") return null;
  // A click opens the panel, except on a link or More.
  const opens = editing && !offline && !narrow;
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    open(container.id);
  };
  return (
    <div className="px-6 pt-3 pb-2 max-md:px-4">
      {/* The header's Description is the way there by keyboard; this is a pointer's shortcut. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={opens ? onClick : undefined}
        className={cn(
          opens && "-mx-2 -my-1 w-fit max-w-full cursor-text rounded-md px-2 py-1 hover:bg-hover",
        )}
      >
        <DescriptionText key={container.id} text={text} />
      </div>
    </div>
  );
}

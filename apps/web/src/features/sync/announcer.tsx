// Announcements (DS-83, Q-02): two visually hidden live regions, there from the workspace's first render so that
// screen readers notice what is put in them. Polite for mode switches, moves and reorders, batch summaries and
// restores; assertive for going offline. Failures and conflicts are announced by their toasts, which are alerts,
// and routine confirmed saves by nothing at all.

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

export type Politeness = "polite" | "assertive";

type Announce = (text: string, politeness?: Politeness) => void;

const AnnounceContext = createContext<Announce>(() => {});

export function Announcer({ children }: { children: ReactNode }) {
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);

  const announce = useCallback<Announce>((text, politeness = "polite") => {
    const region = (politeness === "assertive" ? assertive : polite).current;
    if (!region) return;
    // Emptied first and filled on the next frame, so the same message twice is announced twice.
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = text;
    });
  }, []);

  return (
    <AnnounceContext value={announce}>
      {children}
      <div ref={polite} data-slot="announcer" aria-live="polite" aria-atomic className="sr-only" />
      <div
        ref={assertive}
        data-slot="announcer"
        aria-live="assertive"
        aria-atomic
        className="sr-only"
      />
    </AnnounceContext>
  );
}

/** Says `text` to screen readers, politely unless asked otherwise. */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}

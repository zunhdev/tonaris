// The save states as React reads them (DS-80, DS-81): what Activity lists, and the state a record's marker shows.
// Rows use `useSaveState` for their marker and `aria-busy` (DS-83) and `useLiveHighlight` for changes made
// elsewhere (DS-82); the album rows, the sidebar tree and the inspector wire them in (TON-33, TON-34, TON-38).

import type { SaveState } from "@/client/sync/writer";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import type { OutcomeStatus } from "@tonaris/domain";

import { useSyncClient } from "./sync-provider";

const nothing: readonly SaveState[] = [];

/** The writes not saved yet or waiting for the person, in the order they were made. */
export function useOpenStates(): readonly SaveState[] {
  const states = useSyncClient()?.states;
  const subscribe = useCallback(
    (listener: () => void) => states?.onChange(listener) ?? (() => {}),
    [states],
  );
  const snapshot = useCallback(() => states?.open() ?? nothing, [states]);
  return useSyncExternalStore(subscribe, snapshot);
}

/** The states a marker shows, most pressing first. */
const shown: OutcomeStatus[] = ["conflict", "failed", "unconfirmed", "pending"];

/** The save state a record's marker shows, if any: a conflict, a failure, then unconfirmed and pending writes. */
export function useSaveState(key: string): OutcomeStatus | undefined {
  const open = useOpenStates();
  return useMemo(() => {
    const mine = new Set(open.filter((state) => state.key === key).map((state) => state.status));
    return shown.find((status) => mine.has(status));
  }, [open, key]);
}

/** True once `condition` has held for `ms`: a save shows as pending only after 300 ms (DS-80). */
export function useDelayed(condition: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!condition) return undefined;
    const timer = setTimeout(() => setHeld(true), ms);
    return () => {
      clearTimeout(timer);
      setHeld(false);
    };
  }, [condition, ms]);
  return condition && held;
}

/**
 * Highlights the element `ref` holds for 1.2 s each time its record is changed elsewhere (DS-82), without
 * rendering again: the `.live-update` class restarts its fade, or its static tint under reduced motion.
 */
export function useLiveHighlight(key: string, ref: RefObject<HTMLElement | null>): void {
  const elsewhere = useSyncClient()?.elsewhere;
  useEffect(
    () =>
      elsewhere?.subscribe(key, () => {
        const element = ref.current;
        if (!element) return;
        element.classList.remove("live-update");
        // Reading the layout restarts the animation when the class comes back.
        element.getBoundingClientRect();
        element.classList.add("live-update");
        element.addEventListener("animationend", () => element.classList.remove("live-update"), {
          once: true,
        });
      }),
    [elsewhere, key, ref],
  );
}

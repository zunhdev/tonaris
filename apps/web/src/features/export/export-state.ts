// The data export's state (DS-96, FR-08.6): preparing, ready or failed, kept outside any page, so moving to another
// page doesn't lose it and the download still starts there. The archive stays in the tab, for "Download again",
// until the next export or signing out.

import { apiUrl } from "@/config";
import { useSyncExternalStore } from "react";

import { problemSchema } from "@tonaris/domain";

export type ExportState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "ready"; url: string; fileName: string }
  | { status: "failed"; reason: string };

let state: ExportState = { status: "idle" };
const listeners = new Set<() => void>();

function set(next: ExportState) {
  if (state.status === "ready") URL.revokeObjectURL(state.url);
  state = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useExportState(): ExportState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Saves the archive at `url` as `fileName`, as a download. */
export function save(url: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}

/** Asks for an export, then downloads it; does nothing while one is being prepared. */
export async function startExport(): Promise<void> {
  if (state.status === "preparing") return;
  set({ status: "preparing" });
  try {
    const response = await fetch(`${apiUrl}/v1/export`, { credentials: "include" });
    if (!response.ok) {
      const problem = problemSchema.safeParse(await response.json().catch(() => undefined));
      set({
        status: "failed",
        reason: problem.data?.detail ?? "Couldn't prepare your export. Try again.",
      });
      return;
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "tonaris-export.zip";
    const url = URL.createObjectURL(await response.blob());
    set({ status: "ready", url, fileName });
    save(url, fileName);
  } catch {
    set({
      status: "failed",
      reason: "Couldn't reach Tonaris. Check your connection and try again.",
    });
  }
}

/** Forgets the export and its archive, on signing out. */
export function forgetExport(): void {
  set({ status: "idle" });
}

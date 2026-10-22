// Activity's open state (DS-81), shared by the SyncIndicator that shows it and whatever opens it at a batch report,
// such as a report's toast (DS-84).

import { createContext, useContext } from "react";

export type ActivityControl = {
  open: boolean;
  /** The batch report to bring into view and focus when it opens. */
  report: string | undefined;
  setOpen: (open: boolean) => void;
  /** Opens Activity at a batch report. */
  show: (report: string) => void;
};

export const ActivityContext = createContext<ActivityControl>({
  open: false,
  report: undefined,
  setOpen: () => {},
  show: () => {},
});

export function useActivity(): ActivityControl {
  return useContext(ActivityContext);
}

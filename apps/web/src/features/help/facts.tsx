// Facts Help's pages show from the app's own code, so a page can't fall out of step with it (TS-136): limits here;
// the keyboard shortcuts (shortcuts.tsx) and the AI clients' setup steps (connect-guide.tsx) beside it.

import { limitText, type HelpLimit } from "@/help/limits";

/** A limit's number, as a person reads it: `<Limit of="albums" />` is "50,000". */
export function Limit({ of }: { of: HelpLimit }) {
  return <>{limitText(of)}</>;
}

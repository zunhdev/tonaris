// The mode toggle (DS-45): `View | Edit` in a collection view's header, so the mode is always visible, as is E.
// Leaving Editing stays put if an open inline editor refuses its value (use-mode.ts). Hidden on a narrow screen,
// which is for browsing (FR-04.1).

import { SegmentedControl } from "@tonaris/ui/components/segmented-control";

import type { Mode } from "../shell/device";
import { useMode } from "./collection-ui";

const options: { value: Mode; label: string }[] = [
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

export function ModeSwitch() {
  const { mode, choose } = useMode();
  return (
    <SegmentedControl
      aria-label="Mode"
      aria-keyshortcuts="E"
      options={options}
      value={mode}
      onValueChange={choose}
      className="w-32 max-md:hidden"
    />
  );
}

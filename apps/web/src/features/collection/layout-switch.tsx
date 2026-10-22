// Rows or Grid for a list or Unsorted (DS-40), in the view's header. The choice is kept per view on this device
// (decided 22 October 2026) until TON-35's View options make it a synced preference (FR-11.8).

import { LayoutGrid, Rows3, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@tonaris/ui/components/button";

import { viewLayouts, type Layout } from "../shell/device";
import { useCollectionUi } from "./collection-ui";

/** The layout of the view `view` (a list's ID, or `unsorted`), kept on this device. */
export function useLayout(view: string): [Layout, (layout: Layout) => void] {
  const { accountId } = useCollectionUi();
  const [layout, setLayout] = useState(() => viewLayouts.read(accountId, view));
  // A new view starts from its own kept layout.
  const [shown, setShown] = useState(view);
  if (shown !== view) {
    setShown(view);
    setLayout(viewLayouts.read(accountId, view));
  }
  return [
    layout,
    (next) => {
      setLayout(next);
      viewLayouts.write(accountId, view, next);
    },
  ];
}

const options: { value: Layout; label: string; icon: LucideIcon }[] = [
  { value: "rows", label: "Rows", icon: Rows3 },
  { value: "grid", label: "Grid", icon: LayoutGrid },
];

export function LayoutSwitch({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
}) {
  return (
    <fieldset className="flex rounded-md border border-subtle p-0.5">
      <legend className="sr-only">Layout</legend>
      {options.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          size="sm"
          variant="ghost"
          aria-pressed={layout === value}
          onClick={() => onChange(value)}
          className="aria-pressed:bg-selected aria-pressed:text-fg-primary"
        >
          <Icon strokeWidth={1.5} aria-hidden />
          {label}
        </Button>
      ))}
    </fieldset>
  );
}

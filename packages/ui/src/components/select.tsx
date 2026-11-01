// Select (DS-20): the browser's own select, with Input's look (`border.strong` edge, 3:1, DS-14; 16px text below
// 768px, DS-110). Native, so its list stays inside a dialog and works by keyboard on every platform. 32px high, and as
// wide as its options unless the caller widens it.

import type * as React from "react";

import { controlClass } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(controlClass, "h-8", className)} {...props} />;
}

export { Select };

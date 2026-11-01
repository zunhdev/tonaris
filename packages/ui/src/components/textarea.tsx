// Textarea (DS-20): text over several lines, with Input's look (`border.strong` edge, 3:1, DS-14; 16px text below
// 768px, DS-110), full width, with 6px above and below the text.

import type * as React from "react";

import { controlClass } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "w-full py-1.5", className)}
      {...props}
    />
  );
}

export { Textarea };

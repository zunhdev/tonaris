// The album panel's wash (DS-46, TON-173): its top takes the cover's hue (`washColor`, fixed lightness and capped
// chroma, so text keeps 4.5:1 on it) and fades into the panel over 28rem. It sits behind the panel's content, takes no
// pointer events, and fades in over 200 ms once the color is read; a cover read before shows its wash at once, and
// reduced motion shows it at once. An album without artwork, or a cover that can't be read, has none. Painted through
// the DOM rather than a style attribute, as covers are (TON-126).

import { useCallback, useEffect, useState } from "react";

import { cn } from "@tonaris/ui/lib/utils";
import { washColor } from "@tonaris/ui/lib/wash";

import { coverColor, knownCoverColor, type CoverColor } from "./cover-color";

export function CoverWash({ src }: { src: string | undefined }) {
  const [color, setColor] = useState<CoverColor | null | undefined>(() =>
    src ? knownCoverColor(src) : null,
  );
  // A color known as the panel opens shows at once; one read meanwhile fades in.
  const [atOnce] = useState(() => color !== undefined);
  useEffect(() => {
    if (!src) return undefined;
    if (knownCoverColor(src) !== undefined) return undefined;
    let current = true;
    void (async () => {
      const read = await coverColor(src);
      if (current) setColor(read);
    })();
    return () => {
      current = false;
    };
  }, [src]);
  const paint = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !color) return;
      element.style.backgroundImage = `linear-gradient(to bottom, ${washColor(color.hue, color.chroma)}, transparent)`;
    },
    [color],
  );
  if (!src || !color) return null;
  return (
    <div
      ref={paint}
      aria-hidden
      data-slot="cover-wash"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem]",
        !atOnce && "duration-200 ease-enter motion-safe:animate-in motion-safe:fade-in-0",
      )}
    />
  );
}

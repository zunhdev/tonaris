// Album artwork (DS-23): a fixed square that never shifts the layout. The fallback tile (artwork-tile.ts) shows the
// title's first letter on its hue whenever there is no artwork, while it loads, and if it fails, never as an error.
// An image fades in over it in 150 ms once loaded (DS-17); one the browser already has, such as a card's shown again
// in the inspector, shows at once (TON-159). The image comes from the API's image proxy, never from
// the artwork's own host (TS-103): the album carries the server's signature of its URL. Decorative in rows and
// cards, where the title is beside it; "Cover of {title}" in the inspector. A faint light edge inside every cover
// keeps a dark one's outline on the dark theme, and covers in cards and the inspector cast a soft shadow (TON-167).

import { apiUrl } from "@/config";
import { useCallback, useState } from "react";

import { artworkPath, type Album } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { artworkTile } from "./artwork-tile";

/** Where an album's artwork is shown from: the API's image proxy, once the server has signed its URL. */
export function artworkSrc(album: Album & { artworkSignature?: string }): string | undefined {
  const { artworkUrl, artworkSignature } = album;
  if (!artworkUrl || !artworkSignature) return undefined;
  return `${apiUrl}${artworkPath(artworkUrl, artworkSignature)}`;
}

export function Artwork({
  title,
  src,
  label,
  className,
  letterClassName,
  eager = false,
  raised = false,
}: {
  title: string;
  /** The image proxy's URL for the artwork (`artworkSrc()`), if the album has artwork. */
  src?: string | undefined;
  /** What assistive technology calls it, as in the inspector; decorative without one. */
  label?: string;
  /** Its size, as classes: `size-7` in rows, `w-full` in cards. */
  className?: string;
  letterClassName?: string;
  /** Loaded at once, for artwork that is in view as it shows, as in the inspector; lazily otherwise. */
  eager?: boolean;
  /** Casts a soft shadow, as covers in cards and the inspector do (DS-16's exception). */
  raised?: boolean;
}) {
  const { letter, background, foreground } = artworkTile(title);
  // Painted through the DOM, not a style attribute, which the CSP refuses in server-rendered HTML such as a shared
  // link's page (TON-126). Until the page is live there, the tile is neutral.
  const paint = useCallback(
    (element: HTMLSpanElement | null) => {
      if (!element) return;
      element.style.background = background;
      element.style.color = foreground;
    },
    [background, foreground],
  );
  // By source, so replaced artwork loads afresh; without the fade when the browser already had it.
  const [loaded, setLoaded] = useState<{ src: string; fade: boolean }>();
  const [failed, setFailed] = useState<string>();
  // Checked as the image is attached, before its first paint.
  const loadedAlready = useCallback(
    (element: HTMLImageElement | null) => {
      if (src && element?.complete && element.naturalWidth > 0) setLoaded({ src, fade: false });
    },
    [src],
  );
  const shown = loaded?.src === src;
  const atOnce = shown && loaded?.fade === false;
  return (
    <span
      ref={paint}
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      data-slot="artwork"
      className={cn(
        "relative block aspect-square shrink-0 overflow-hidden rounded-sm bg-raised text-fg-secondary",
        raised && "shadow-artwork",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center font-medium",
          letterClassName,
        )}
      >
        {letter}
      </span>
      {src && src !== failed && (
        <img
          ref={loadedAlready}
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() =>
            setLoaded((current) => (current?.src === src ? current : { src, fade: true }))
          }
          onError={() => setFailed(src)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            !atOnce && "transition-opacity duration-150 ease-enter",
            shown ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* Above the image: an inset ring on the box itself would paint under it. */}
      <span
        aria-hidden
        data-slot="artwork-edge"
        className="pointer-events-none absolute inset-0 rounded-[inherit] inset-ring inset-ring-artwork"
      />
    </span>
  );
}

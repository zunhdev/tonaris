// Album artwork (DS-23): a fixed square that never shifts the layout. The fallback tile (artwork-tile.ts) shows the
// title's first letter on its hue whenever there is no artwork, while it loads, and if it fails, never as an error.
// An image fades in over it in 150 ms once loaded (DS-17). The image comes from the API's image proxy, never from
// the artwork's own host (TS-103): the album carries the server's signature of its URL. Decorative in rows and
// cards, where the title is beside it; "Cover of {title}" in the inspector.

import { apiUrl } from "@/config";
import { useState } from "react";

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
}: {
  title: string;
  /** The image proxy's URL for the artwork (`artworkSrc()`), if the album has artwork. */
  src?: string | undefined;
  /** What assistive technology calls it, as in the inspector; decorative without one. */
  label?: string;
  /** Its size, as classes: `size-7` in rows, `w-full` in cards. */
  className?: string;
  letterClassName?: string;
}) {
  const tile = artworkTile(title);
  // By source, so replaced artwork loads afresh.
  const [loaded, setLoaded] = useState<string>();
  const [failed, setFailed] = useState<string>();
  return (
    <span
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={cn("relative block aspect-square shrink-0 overflow-hidden rounded-sm", className)}
      style={{ background: tile.background }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center font-medium",
          letterClassName,
        )}
        style={{ color: tile.foreground }}
      >
        {tile.letter}
      </span>
      {src && src !== failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={cn(
            "absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-150 ease-enter",
            loaded === src && "opacity-100",
          )}
        />
      )}
    </span>
  );
}

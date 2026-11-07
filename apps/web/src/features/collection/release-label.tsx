// The label on a card's cover (DS-22, TON-167): what kind of release it is, when it isn't a plain studio album. The
// type's name for an EP, a single or a compilation, and "Live" for a live album, both for a live compilation. Unlike
// FR-05.9's group, where a live compilation sits under Live alone, a label can say both.

import { groupNames, type Album } from "@tonaris/domain";

export function releaseLabel(album: Pick<Album, "releaseType" | "isLive">): string | undefined {
  const parts: string[] = [];
  if (album.releaseType !== null && album.releaseType !== "album") {
    parts.push(groupNames[album.releaseType]);
  }
  if (album.isLive === true) parts.push(groupNames.live);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * The label on the cover's top-left corner, the save state having the top-right. Only for the eye: the card says the
 * same after its year for assistive technology (`ReleaseLabelText`), so its name still starts with the title.
 */
export function ReleaseLabel({ label }: { label: string | undefined }) {
  if (label === undefined) return null;
  return (
    <span
      aria-hidden
      data-slot="release-label"
      className="absolute top-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-sm bg-on-artwork px-1.5 py-0.5 text-micro font-semibold tracking-[0.05em] text-fg-on-artwork uppercase backdrop-blur-sm"
    >
      {label}
    </span>
  );
}

/** The label's words for assistive technology, after the year. */
export function ReleaseLabelText({ label }: { label: string | undefined }) {
  return label === undefined ? null : <span className="sr-only">, {label}</span>;
}

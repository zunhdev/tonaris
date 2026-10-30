// The artwork fallback tile (DS-23, FR-03.4): the title's first letter on a calm hue taken from the title, so the
// same title always gets the same tile. Leading punctuation is skipped, so "...And Justice for All" shows "A". It stands in for artwork that is missing, loading or failed. The hue comes
// from a 32-bit FNV-1a hash; the colors are low-chroma OKLCH, the letter far lighter than its ground (DS-12, DS-14).

export type Tile = { letter: string; background: string; foreground: string };

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const unit of new TextEncoder().encode(text)) {
    hash ^= unit;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const punctuationOrSpace = /^[\p{P}\p{Z}]/u;

/** The first grapheme that isn't punctuation or a space, or the first one when all are (TON-110). */
function firstMark(text: string): string {
  let fallback = "";
  for (const { segment } of graphemes.segment(text)) {
    if (!punctuationOrSpace.test(segment)) return segment;
    fallback ||= segment;
  }
  return fallback;
}

/** The tile for an album titled `title`; a neutral one, without a letter, for a blank title. */
export function artworkTile(title: string): Tile {
  const trimmed = title.trim();
  const first = firstMark(trimmed);
  if (!first) {
    return { letter: "", background: "oklch(0.3 0 0)", foreground: "oklch(0.86 0 0)" };
  }
  const hue = fnv1a(trimmed) % 360;
  return {
    letter: first.toLocaleUpperCase(),
    background: `oklch(0.33 0.04 ${hue})`,
    foreground: `oklch(0.86 0.04 ${hue})`,
  };
}

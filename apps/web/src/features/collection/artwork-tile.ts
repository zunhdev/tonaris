// The artwork fallback tile (DS-23, FR-03.4): the title's first letter on a calm hue taken from the title, so the
// same title always gets the same tile. It stands in for artwork that is missing, loading or failed. The hue comes
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

/** The tile for an album titled `title`; a neutral one, without a letter, for a blank title. */
export function artworkTile(title: string): Tile {
  const trimmed = title.trim();
  const first = graphemes.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? "";
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

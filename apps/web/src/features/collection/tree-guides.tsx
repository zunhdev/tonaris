// The tree's guide lines (DS-27, TON-169): under every level above a row's own, a faint line where that level's
// chevron sits, so an open folder's branch reads as one down to its last child. Each line also covers the 1px gap
// above its row, so a column of rows draws it unbroken. The row must be `relative`.

const levelOffset = 11;
const levelStep = 12;

export function TreeGuides({ level }: { level: number }) {
  if (level < 2) return null;
  return Array.from({ length: level - 1 }, (_, depth) => (
    <span
      key={depth}
      aria-hidden
      data-slot="tree-guide"
      className="pointer-events-none absolute -top-px bottom-0 w-px bg-subtle"
      // Under the chevron of the level `depth + 1` (`indent`: 4 + (level − 1) × 12 px, and the chevron is 14 px).
      style={{ left: `${levelOffset + depth * levelStep}px` }}
    />
  ));
}

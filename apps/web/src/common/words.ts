// Counts in words (DS-107): the number, then its noun, singular for one.

/** "1 album", "3 albums". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

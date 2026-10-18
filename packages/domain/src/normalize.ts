// Name and search keys (TS-12). One implementation runs on the server, in the web client, behind MCP and in
// the export, so names collide and searches match the same way everywhere (X-02). Keys are stored with the
// row and never computed in SQL, whose case and accent tables differ from these.

const dotlessI = "ı";
const nonAscii = /\P{ASCII}/u;

/**
 * Unicode full case folding, code point by code point: "ß" and "ẞ" fold to "ss", "Σ" and "ς" to "σ".
 * Folding each code point through lower → upper → lower matches Unicode's CaseFolding.txt for every
 * character the engine knows (checked against Unicode 18 in normalize.test.ts), except that it would also
 * merge the Turkish dotless "ı" into "i", which Unicode keeps apart, so that one is left alone.
 */
export function caseFold(text: string): string {
  if (!nonAscii.test(text)) return text.toLowerCase();
  let folded = "";
  for (const character of text) {
    folded +=
      character === dotlessI ? character : character.toLowerCase().toUpperCase().toLowerCase();
  }
  return folded;
}

/**
 * The key that makes names unique (X-06, FR-03.9): trimmed, NFC, case-folded. Case-insensitive only:
 * "Favorites" and "favorites" collide, while "Café" and "Cafe" stay distinct.
 */
export function nameKey(name: string): string {
  return caseFold(name.trim().normalize("NFC")).normalize("NFC");
}

const withoutMarks = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "");

/**
 * The key search matches against (FR-12.5): NFKD, combining marks removed, case-folded, whitespace
 * collapsed. Case- and accent-insensitive: "Björk" becomes "bjork", "Straße" becomes "strasse".
 * Marks are removed again after folding, which can introduce them (e.g. "İ").
 */
export function searchKey(text: string): string {
  return withoutMarks(caseFold(withoutMarks(text)))
    .replace(/\s+/gu, " ")
    .trim();
}

/** Whether `query` matches `text` (FR-12.5): a substring of its search key, with no typo tolerance. */
export function searchMatches(query: string, text: string): boolean {
  return searchKey(text).includes(searchKey(query));
}

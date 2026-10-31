// Which pasted lines are links (DS-48, TS-40): each trimmed line that is an `http(s)` URL, a `spotify:` URI, or starts
// with a host the services use, without its scheme. Capture reads each one and explains any it can't use, so this
// only keeps a paste of ordinary text from becoming captures; it never decides what is supported.

/** Links pasted at once, at most: one batch (TS-25). */
export const maxPastedLinks = 200;

const schemeless =
  /^(open\.spotify\.com|spotify\.link|spotify\.app\.link|(geo\.)?music\.apple\.com|(www\.|open\.|play\.)?qobuz\.com|(www\.|listen\.)?tidal\.com|(music\.|www\.|m\.)?youtube\.com)\//i;

/** Whether `line`, trimmed, looks like a link. */
export function isLinkLike(line: string): boolean {
  return /^https?:\/\/\S+$/i.test(line) || /^spotify:\S+$/i.test(line) || schemeless.test(line);
}

/** The lines of `text` that look like links, trimmed, in order. */
export function linksIn(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isLinkLike);
}

/** The non-empty lines of `text`, trimmed: what the capture dialog sends, each explained if it isn't a link. */
export function linesIn(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

// Which pasted lines are links (DS-48, TS-40): each trimmed line that is an `http(s)` URL, a `spotify:` URI, or starts
// with a host the services' links or short links are on (`isLinkHost`), and then a path, without its scheme. Capture
// reads each one and explains any it can't use, so this only keeps a paste of ordinary text from becoming captures;
// it never decides what is supported. A paste takes at most one batch's links (`maxBatchItems`, TS-25).

import { isLinkHost } from "@tonaris/providers/links";

/** Whether `line` starts with a service's host and a path, without its scheme. */
function isSchemeless(line: string): boolean {
  const host = /^([^/]+)\//.exec(line)?.[1];
  return host !== undefined && isLinkHost(host);
}

/** Whether `line`, trimmed, looks like a link. */
export function isLinkLike(line: string): boolean {
  return /^https?:\/\/\S+$/i.test(line) || /^spotify:\S+$/i.test(line) || isSchemeless(line);
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

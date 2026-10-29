// Where sign-in lands afterwards (DS-90): the page the person asked for, but only a path inside this app.

const collection = "/c";
const here = "https://tonaris.invalid";

/**
 * `value` when it is a path in this app, otherwise the collection. It is read as a browser reads a URL, which drops
 * tabs and newlines and takes `\` for `/`, so `//evil.example`, `/\evil.example` and `/<tab>/evil.example` all land
 * on the collection rather than sending a fresh session elsewhere (TON-95). A sign-in page would loop back to itself.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return collection;
  let url: URL;
  try {
    url = new URL(value, here);
  } catch {
    return collection;
  }
  if (url.origin !== here) return collection;
  if (url.pathname === "/sign-in" || url.pathname.startsWith("/sign-in/")) return collection;
  return `${url.pathname}${url.search}${url.hash}`;
}

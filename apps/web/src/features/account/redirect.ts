// Where sign-in lands afterwards (DS-90): the page the person asked for, but only a path inside this app.

const collection = "/c";

/**
 * `value` when it is a path in this app, otherwise the collection. Absolute and protocol-relative URLs
 * (`https://…`, `//evil.example`, `/\evil.example`) could send a fresh session elsewhere, and a sign-in page
 * would loop back to itself.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return collection;
  if (value.startsWith("//") || value.startsWith("/\\")) return collection;
  if (value === "/sign-in" || value.startsWith("/sign-in/") || value.startsWith("/sign-in?")) {
    return collection;
  }
  return value;
}

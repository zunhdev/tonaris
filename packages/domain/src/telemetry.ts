// What may leave in logs and error reports (TS-115, Q-06): no token, secret, cookie, code or email address. Values
// under a key that names one are replaced; in free text, bearer tokens, JWTs, emails, the tokens in share, join and
// recovery paths, and the values of token-like query parameters are. Titles and descriptions are kept out by not
// sending request bodies at all: the reporters attach none.

const sensitiveKey = /token|secret|password|passwd|cookie|authorization|^code$|otp|e-?mail/i;

const patterns: [RegExp, string][] = [
  [/Bearer\s+[\w.~+/=-]+/gi, "Bearer [redacted]"],
  [/\b[\w-]{12,}\.[\w-]{12,}\.[\w-]{12,}\b/g, "[jwt]"],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/\/(s|join|recover)\/[\w-]{16,}/g, "/$1/[token]"],
  [/([?&](?:token|code|otp|key|secret|signature|state)=)[^&#\s]*/gi, "$1[redacted]"],
];

/** `text` with whatever would identify a person or let someone in replaced. */
export function redactText(text: string): string {
  let redacted = text;
  for (const [pattern, replacement] of patterns) redacted = redacted.replace(pattern, replacement);
  return redacted;
}

/** `value` with sensitive keys' values replaced and every string redacted, as deep as it goes. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (depth > 8 || typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? "[redacted]" : redact(child, depth + 1),
    ]),
  );
}

/** A record's values, redacted as `redact` does: for the parts of a report that are records. */
export function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? "[redacted]" : redact(child, 1),
    ]),
  );
}

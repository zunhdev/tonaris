// A read from the API that follows a key (FR-07.11, FR-12.3, DS-60, DS-69): whenever the key changes, and `delayMs`
// after it last did, the read runs again, and its answer comes back with the key it was read for. An answer that
// arrives once the key has moved on is dropped. Callers choose what shows meanwhile: the last answer, or nothing until
// the answer for their key.

import { useEffect, useRef, useState } from "react";

/** An answer, and the key it was read for. */
export type KeyedAnswer<T> = { key: string; value: T };

/**
 * The latest answer of `read` for `key`, read again whenever `key` changes; undefined until the first. With no key,
 * nothing is read. A read that answers undefined or fails keeps the answer before it.
 */
export function useKeyedRead<T>(
  key: string | undefined,
  read: () => Promise<T | undefined>,
  { delayMs = 0 }: { delayMs?: number } = {},
): KeyedAnswer<T> | undefined {
  const [answer, setAnswer] = useState<KeyedAnswer<T>>();
  // The latest read, for the key it is asked for.
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    if (key === undefined) return () => {};
    let current = true;
    const ask = () => {
      latest.current().then(
        (value) => {
          if (current && value !== undefined) setAnswer({ key, value });
          return value;
        },
        () => undefined,
      );
    };
    const timer = delayMs > 0 ? setTimeout(ask, delayMs) : undefined;
    if (timer === undefined) ask();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, delayMs]);
  return answer;
}

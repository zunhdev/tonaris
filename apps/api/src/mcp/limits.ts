// MCP's abuse limits (TS-66, TS-18, FR-15.4), per connection: a token bucket for reads and one for writes, and at
// most four requests at once. A call over its rate answers `rate_limited` as a tool result, with how long to wait, so
// the agent reads it and waits; changes it couldn't make are untouched (X-05). Batches are capped at 200 by each tool's
// schema. Counters live in memory, as the API runs as a single instance, like the sign-in limits (TS-104).

import type { McpServer } from "@modelcontextprotocol/server";

import { TokenBuckets } from "../token-buckets";
import { failed } from "./results";

export const mcpLimits = {
  /** Calls of read-only tools per minute. */
  reads: 120,
  /** Calls of every other tool per minute, gated ones included. */
  writes: 60,
  /** Requests in flight at once. */
  concurrent: 4,
} as const;

export type CallKind = "read" | "write";

export type McpLimiter = {
  /** Takes a call from the connection's budget, or answers the seconds to wait; a refusal takes nothing. */
  take(grantId: string, kind: CallKind): number | undefined;
  /** Counts a request in flight, answering its release, or undefined when the connection has too many. */
  enter(grantId: string): (() => void) | undefined;
};

export function createMcpLimiter(now: () => number = Date.now): McpLimiter {
  // One bucket per connection and kind: as many as there are connections.
  const buckets = {
    read: new TokenBuckets({ capacity: mcpLimits.reads, refillMs: 60_000 }, now),
    write: new TokenBuckets({ capacity: mcpLimits.writes, refillMs: 60_000 }, now),
  };
  const inFlight = new Map<string, number>();
  return {
    take(grantId, kind) {
      const waitMs = buckets[kind].take(grantId);
      return waitMs === undefined ? undefined : Math.ceil(waitMs / 1000);
    },
    enter(grantId) {
      const count = inFlight.get(grantId) ?? 0;
      if (count >= mcpLimits.concurrent) return undefined;
      inFlight.set(grantId, count + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (inFlight.get(grantId) ?? 1) - 1;
        if (left > 0) inFlight.set(grantId, left);
        else inFlight.delete(grantId);
      };
    },
  };
}

/**
 * `server`, whose tools each take a call from the connection's read or write budget before they run: read-only tools
 * by their annotation, every other one as a write.
 */
export function withRateLimits(
  server: McpServer,
  take: (kind: CallKind) => number | undefined,
): McpServer {
  return new Proxy(server, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver);
      if (property !== "registerTool" || typeof value !== "function") return value;
      return (
        name: string,
        config: { annotations?: { readOnlyHint?: boolean } },
        handler: unknown,
      ) => {
        const kind: CallKind = config.annotations?.readOnlyHint === true ? "read" : "write";
        const limited = (...args: unknown[]): unknown => {
          const wait = take(kind);
          if (wait !== undefined) {
            return failed(
              "rate_limited",
              `This connection made too many ${kind === "read" ? "reads" : "changes"} in the last minute. Nothing was done; try again in ${wait} seconds.`,
            );
          }
          return typeof handler === "function"
            ? Reflect.apply(handler, undefined, args)
            : undefined;
        };
        return Reflect.apply(value, target, [name, config, limited]);
      };
    },
  });
}

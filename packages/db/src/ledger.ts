// The revocation ledger (TS-113, Q-04): each deletion-class change queues a `ledger.append` job in its own
// transaction, so the event exists exactly when the change does; the API's worker then writes it off-site, retrying
// until it lands. Where it is written is `LEDGER_URL`:
// - `file:///dir/` (development and drills): monthly JSON-lines files, `ledger-YYYY-MM.jsonl`, appended to;
// - `s3://bucket/prefix` (production): one object per event, `prefix/{eventId}.json`, in a bucket of its own with
//   write-once retention where the storage supports it (an R2 bucket lock, docs/deploy.md). Credentials come from
//   the `S3_*` environment (Bun).
// A retried append can write an event twice. A locked bucket refuses the second write, which counts as done once the
// object is there; elsewhere, reading drops the repeat, and the replay is idempotent anyway.

import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ledgerEventSchema,
  ledgerJobKind,
  uuidv7,
  type LedgerEntry,
  type LedgerEvent,
} from "@tonaris/domain";

import type { Transaction } from "./client";
import { enqueueJob } from "./jobs";

/** Queues `entry` for the ledger, in the transaction that makes the change it records. */
export async function recordInLedger(
  tx: Transaction,
  entry: LedgerEntry,
  at: Date = new Date(),
): Promise<void> {
  const id = uuidv7();
  const event: LedgerEvent = { ...entry, id, at: at.toISOString() };
  await enqueueJob(tx, { id, kind: ledgerJobKind, payload: event, runAt: at });
}

export type LedgerStore = {
  /** Writes one event; writing it again is harmless. */
  append(event: LedgerEvent): Promise<void>;
  /** Every event, each once, oldest first. */
  events(): Promise<LedgerEvent[]>;
};

/** The ledger at `url`: `file:` for a directory, `s3:` for a bucket and prefix. */
export function ledgerStore(url: string): LedgerStore {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") return fileLedger(fileURLToPath(parsed));
  if (parsed.protocol === "s3:") {
    const prefix = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return s3Ledger(new Bun.S3Client({ bucket: parsed.hostname }), prefix);
  }
  throw new Error(`LEDGER_URL must be a file: or s3: URL, not ${parsed.protocol}`);
}

/** Each event once, in the order they happened: UUIDv7s sort by time. */
function inOrder(events: readonly LedgerEvent[]): LedgerEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function fileLedger(dir: string): LedgerStore {
  return {
    async append(event) {
      await mkdir(dir, { recursive: true });
      await appendFile(
        path.join(dir, `ledger-${event.at.slice(0, 7)}.jsonl`),
        `${JSON.stringify(event)}\n`,
      );
    },
    async events() {
      const names = await readdir(dir).catch(() => []);
      const files = names.filter((name) => /^ledger-\d{4}-\d{2}\.jsonl$/.test(name));
      const texts = await Promise.all(files.map((name) => readFile(path.join(dir, name), "utf8")));
      return inOrder(
        texts.flatMap((text) =>
          text
            .split("\n")
            .filter(Boolean)
            .map((line) => ledgerEventSchema.parse(JSON.parse(line))),
        ),
      );
    },
  };
}

function s3Ledger(client: Bun.S3Client, prefix: string): LedgerStore {
  const keyOf = (id: string) => (prefix ? `${prefix}/${id}.json` : `${id}.json`);
  return {
    async append(event) {
      const key = keyOf(event.id);
      try {
        await client.write(key, JSON.stringify(event), { type: "application/json" });
      } catch (error) {
        // A bucket lock refuses to overwrite: an earlier attempt landed, though its answer may not have.
        if (!(await client.file(key).exists())) throw error;
      }
    },
    async events() {
      const keys: string[] = [];
      let startAfter: string | undefined;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- each page starts after the last
        const page = await client.list({ prefix: prefix ? `${prefix}/` : undefined, startAfter });
        const found = (page.contents ?? []).map((object) => object.key);
        keys.push(...found);
        if (!page.isTruncated || found.length === 0) break;
        startAfter = found.at(-1);
      }
      const texts = await Promise.all(keys.map((key) => client.file(key).text()));
      return inOrder(texts.map((text) => ledgerEventSchema.parse(JSON.parse(text))));
    },
  };
}

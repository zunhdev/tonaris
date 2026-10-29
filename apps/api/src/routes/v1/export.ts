// The data export (FR-08.1, FR-08.5, FR-08.6; TS-80): `GET /v1/export` reads the signed-in owner's collection in one
// read-only snapshot, builds `tonaris-export.json` with the provider policy applied (TS-15), and streams a ZIP of it,
// its JSON Schema, `collection.md` and `README.md`. App-only: /v1 refuses MCP tokens (TS-62). Five exports an hour per
// account (TS-18), counted in memory as the API runs as one instance (TS-104); a failed build counts nothing, so it
// can be retried. Exporting never writes.

import { Elysia } from "elysia";
import { strToU8, Zip, ZipDeflate } from "fflate";

import { exportSource, type Database } from "@tonaris/db";
import { buildExport, exportFiles, maxExportsPerHour } from "@tonaris/domain";
import { policy } from "@tonaris/providers";

import type { SessionGuard } from "../../auth/plugin";
import { SlidingWindow } from "../../auth/sign-in-limits";
import { problemResponse } from "../../openapi";
import { ProblemError } from "../../problem";

const hour = 60 * 60_000;

/** `tonaris-export-YYYYMMDD-HHmm.zip`, in UTC (TS-80). */
export function exportFileName(exportedAt: string): string {
  const [date = "", time = ""] = exportedAt.split("T");
  return `tonaris-export-${date.replaceAll("-", "")}-${time.slice(0, 5).replace(":", "")}.zip`;
}

/** A ZIP of `files`, streamed as fflate deflates them; each entry is dated `modified`. */
function zipStream(files: readonly [string, string][], modified: Date): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      for (const [name, text] of files) {
        const entry = new ZipDeflate(name, { level: 6 });
        entry.mtime = modified;
        zip.add(entry);
        entry.push(strToU8(text), true);
      }
      zip.end();
    },
  });
}

export function exportRoutes(
  session: SessionGuard,
  { db, now = Date.now }: { db: Database; now?: () => number },
) {
  const recent = new SlidingWindow({ max: maxExportsPerHour, windowMs: hour }, now);
  return new Elysia().use(session).get(
    "/export",
    {
      signedIn: true,
      detail: {
        summary: "Download your data",
        description:
          "The signed-in owner's whole collection as a ZIP (FR-08, TS-80): `tonaris-export.json` (format 1.0), `tonaris-export.schema.json`, `collection.md` and `README.md`, read in one consistent snapshot. Unsorted and Trash are included; sharing, Shared with me and the account's profile are not. Five exports an hour; over that, `429` with `Retry-After`.",
        tags: ["export"],
        operationId: "exportData",
        responses: {
          200: {
            description: "The archive, `tonaris-export-YYYYMMDD-HHmm.zip`.",
            content: { "application/zip": { schema: { type: "string", format: "binary" } } },
          },
          // Listed here, as a binary answer can't be declared beside them in `response`.
          401: problemResponse,
          429: problemResponse,
        },
      },
    },
    async ({ account }) => {
      const waitMs = recent.waitMs(account.id);
      if (waitMs > 0) {
        const minutes = Math.ceil(waitMs / 60_000);
        throw new ProblemError(
          429,
          "rate_limited",
          `You've exported your data ${maxExportsPerHour} times in the last hour. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
          { "retry-after": String(Math.ceil(waitMs / 1000)) },
        );
      }
      const exportedAt = new Date(now());
      const data = buildExport(
        await exportSource(db, account.id, exportedAt),
        (source) => policy[source].exportable,
      );
      recent.hit(account.id);
      return new Response(zipStream(exportFiles(data), exportedAt), {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="${exportFileName(data.exportedAt)}"`,
          "cache-control": "no-store",
        },
      });
    },
  );
}

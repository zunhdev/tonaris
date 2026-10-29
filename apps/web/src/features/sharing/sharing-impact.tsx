// What a move or a recovery would do to sharing (DS-69; FR-07.9, FR-07.10, FR-07.14), before it happens: read from the
// API's preview and drawn as a compact block. "Newly visible to …" names the audiences it gains, "No longer visible
// through '{folder}': …" those it loses with the folders it leaves, never one another path keeps, and "Still shared
// directly with …" the shares on it and its contents; "Sharing unchanged" when nothing is gained or lost. People go
// by display name or the address as typed, "(invited)" until they accept; links by the folder or list they share.
// Answers are kept for half a minute, so going back to a destination shows at once.

import { api } from "@/api";
import { useEffect, useState } from "react";

import type { Audience, SharingImpact } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

/** A move of a folder or list into a folder or the root, or a Trash unit's recovery, by default to where it was. */
export type ImpactQuery =
  | { move: string; to: string | null }
  | { recover: string; to?: string | null | undefined };

const keptMs = 30_000;
const answers = new Map<string, { at: number; impact: SharingImpact }>();

const keyOf = (query: ImpactQuery) =>
  "move" in query
    ? `move:${query.move}:${query.to ?? "root"}`
    : `recover:${query.recover}:${query.to === undefined ? "" : (query.to ?? "root")}`;

/** The preview for `query`; throws if it can't be read. */
export async function readImpact(query: ImpactQuery): Promise<SharingImpact> {
  const key = keyOf(query);
  const kept = answers.get(key);
  if (kept && performance.now() - kept.at < keptMs) return kept.impact;
  const to = query.to === undefined ? {} : { to: query.to ?? "root" };
  const { data } = await api.v1.sharing.impact.get({
    query: "move" in query ? { move: query.move, ...to } : { recover: query.recover, ...to },
  });
  if (!data) throw new Error("The sharing preview couldn't be read.");
  answers.set(key, { at: performance.now(), impact: data });
  // A few dozen at most: the oldest go.
  for (const old of answers.keys()) {
    if (answers.size <= 50) break;
    answers.delete(old);
  }
  return data;
}

type Read = { key: string } & ({ status: "read"; impact: SharingImpact } | { status: "failed" });

/** Reads the preview for `query`, after it has stayed the same for `delay` ms. */
function useImpact(query: ImpactQuery | undefined, delay: number): Read | "reading" | undefined {
  // The query by its parts, so the read starts again only when one changes.
  const kind = query === undefined ? undefined : "move" in query ? "move" : "recover";
  const id = query === undefined ? undefined : "move" in query ? query.move : query.recover;
  const to = query?.to;
  const key = query === undefined ? undefined : keyOf(query);
  const [read, setRead] = useState<Read>();
  useEffect(() => {
    if (kind === undefined || id === undefined) return () => {};
    const wanted: ImpactQuery =
      kind === "move" ? { move: id, to: to ?? null } : { recover: id, to };
    const at = keyOf(wanted);
    let current = true;
    const timer = setTimeout(() => {
      readImpact(wanted).then(
        (impact) => {
          if (current) setRead({ key: at, status: "read", impact });
          return impact;
        },
        () => {
          if (current) setRead({ key: at, status: "failed" });
        },
      );
    }, delay);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, id, to, delay]);
  if (key === undefined) return undefined;
  return read?.key === key ? read : "reading";
}

const sentence = (parts: string[]) =>
  parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const nameOf = (audience: Audience, sameFolder = false) =>
  audience.kind === "link"
    ? sameFolder
      ? "anyone with its link"
      : `anyone with the link to '${audience.via.name}'`
    : `${audience.name}${audience.pending ? " (invited)" : ""}`;

/** The block's lines for an answer. */
export function impactLines({ added, removed, direct }: SharingImpact): string[] {
  const lines: string[] = [];
  if (added.length > 0) {
    lines.push(`Newly visible to ${sentence(added.map((audience) => nameOf(audience)))}`);
  }
  for (const [, lost] of Map.groupBy(removed, (audience) => audience.via.id)) {
    const folder = lost[0]?.via.name ?? "";
    lines.push(
      `No longer visible through '${folder}': ${sentence(lost.map((audience) => nameOf(audience, true)))}`,
    );
  }
  if (added.length === 0 && removed.length === 0) lines.push("Sharing unchanged");
  if (direct.length > 0) {
    lines.push(
      `Still shared directly with ${sentence(direct.map((audience) => nameOf(audience)))}`,
    );
  }
  return lines;
}

/** The block, for an answer, while reading, or when it couldn't be read. */
export function SharingImpactBlock({
  impact,
  className,
}: {
  impact: SharingImpact | "reading" | "failed";
  className?: string;
}) {
  const lines =
    impact === "reading"
      ? ["Checking sharing…"]
      : impact === "failed"
        ? ["Sharing effects couldn't be checked."]
        : impactLines(impact);
  return (
    <output
      aria-label="Sharing"
      className={cn(
        "flex flex-col gap-0.5 rounded-md border border-subtle bg-panel px-3 py-2 text-small text-fg-secondary",
        className,
      )}
    >
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </output>
  );
}

/** The block for `query`, read after it has stayed the same for `delay` ms; nothing without a query. */
export function SharingImpactPreview({
  query,
  delay = 0,
  className,
}: {
  query: ImpactQuery | undefined;
  delay?: number;
  className?: string;
}) {
  const read = useImpact(query, delay);
  if (read === undefined) return null;
  return (
    <SharingImpactBlock
      impact={read === "reading" ? "reading" : read.status === "read" ? read.impact : "failed"}
      className={className}
    />
  );
}

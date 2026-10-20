// The perf page's UI: the workload's lists, a virtualized album list with 36 px rows (DS-21), a sort toggle, and
// an inline editor for the first album's year. Plain markup: it measures the sync client, TanStack DB's live
// queries and React, not the design system. Each timer ends when React has rendered the result.

import { eq, useLiveQuery } from "@tanstack/react-db";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState } from "react";

import type { SyncClient } from "../src/client/sync/client";
import { perf } from "./marks";

type Sort = "title" | "year";
type View = { listId: string | null; sort: Sort };
type Row = { id: string; title: string; artistCredit: string; originalYear: number | null };

const rowHeight = 36;

export function App({ client }: { client: SyncClient }) {
  const [view, setView] = useState<View>({ listId: null, sort: "title" });
  const lists = useLiveQuery({
    query: (q) =>
      q
        .from({ c: client.containers })
        .where(({ c }) => eq(c.kind, "list"))
        .orderBy(({ c }) => c.name),
  });

  const open = (listId: string | null, at: number) => {
    perf.begin("switch", at);
    setView((current) => ({ ...current, listId }));
  };
  const sortBy = (sort: Sort, at: number) => {
    perf.begin("sort", at);
    setView((current) => ({ ...current, sort }));
  };

  return (
    <div style={{ display: "flex", height: "100vh", font: "14px system-ui, sans-serif" }}>
      <nav
        aria-label="Lists"
        style={{ width: "min(260px, 40vw)", overflow: "auto", borderRight: "1px solid #ccc" }}
      >
        <button type="button" data-list="all" onClick={(event) => open(null, event.timeStamp)}>
          All albums
        </button>
        {lists.data?.map((list) => (
          <button
            key={list.id}
            type="button"
            data-list={list.id}
            style={{ display: "block", textAlign: "left" }}
            onClick={(event) => open(list.id, event.timeStamp)}
          >
            {list.name}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ display: "flex", gap: 8, padding: 8 }}>
          <button
            type="button"
            data-sort="title"
            onClick={(event) => sortBy("title", event.timeStamp)}
          >
            Title
          </button>
          <button
            type="button"
            data-sort="year"
            onClick={(event) => sortBy("year", event.timeStamp)}
          >
            Year
          </button>
          <Editor client={client} />
        </header>
        <ListView client={client} view={view} />
      </main>
    </div>
  );
}

/** Edits the year of the first album by title, the top row of All albums. */
function Editor({ client }: { client: SyncClient }) {
  const [draft, setDraft] = useState("");
  const first = useLiveQuery({
    query: (q) =>
      q
        .from({ a: client.albums })
        .orderBy(({ a }) => a.title)
        .orderBy(({ a }) => a.id)
        .limit(1),
  });
  const target = first.data?.[0];

  return (
    <input
      aria-label="Year of the first album"
      data-testid="edit-year"
      data-album={target?.id}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !target) return;
        const year = Number(draft);
        const key = `${target.id}:${year}`;
        perf.begin(`edit:${key}`, event.timeStamp);
        perf.begin(`confirm:${key}`, event.timeStamp);
        perf.madeAt.set(key, Date.now());
        const tx = client.albums.update(target.id, (album) => {
          album.originalYear = year;
        });
        tx.when("settled").then(
          () => perf.end(`confirm:${key}`, "confirmation"),
          () => perf.end(`confirm:${key}`, "confirmation-failed"),
        );
      }}
    />
  );
}

function ListView({ client, view: { listId, sort } }: { client: SyncClient; view: View }) {
  const { data, isReady, collection } = useLiveQuery({
    query: (q) => {
      if (listId === null) {
        return q
          .from({ a: client.albums })
          .orderBy(({ a }) => (sort === "title" ? a.title : a.originalYear))
          .orderBy(({ a }) => a.id)
          .select(({ a }) => ({
            id: a.id,
            title: a.title,
            artistCredit: a.artistCredit,
            originalYear: a.originalYear,
          }));
      }
      return q
        .from({ m: client.memberships })
        .where(({ m }) => eq(m.listId, listId))
        .innerJoin({ a: client.albums }, ({ m, a }) => eq(m.albumId, a.id))
        .orderBy(({ a }) => (sort === "title" ? a.title : a.originalYear))
        .orderBy(({ a }) => a.id)
        .select(({ a }) => ({
          id: a.id,
          title: a.title,
          artistCredit: a.artistCredit,
          originalYear: a.originalYear,
        }));
    },
  });
  const rows: Row[] = data ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  const shown = isReady && (items.length > 0 || rows.length === 0);

  useLayoutEffect(() => {
    if (!shown) return;
    const size = listId === null ? "all" : "list";
    perf.end("cold", "cold-start");
    perf.end("switch", `open-${size}`);
    perf.end("sort", `sort-${size}`);
    // The rows depend only on the collection and readiness here; a new collection is a new list or order.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, shown]);

  return (
    <div
      ref={scroller}
      data-testid="rows"
      data-view={`${listId ?? "all"}:${sort}`}
      data-count={rows.length}
      style={{ flex: 1, overflow: "auto", contain: "strict" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {items.map((item) => {
          const row = rows[item.index];
          return row ? <AlbumRow key={row.id} row={row} top={item.start} /> : null;
        })}
      </div>
    </div>
  );
}

function AlbumRow({ row, top }: { row: Row; top: number }) {
  useLayoutEffect(() => {
    const key = `${row.id}:${row.originalYear}`;
    perf.end(`edit:${key}`, "feedback");
    if (!perf.shownAt.has(key)) perf.shownAt.set(key, Date.now());
  }, [row.id, row.originalYear]);

  return (
    <div
      data-album={row.id}
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height: rowHeight,
        display: "grid",
        gridTemplateColumns: "2fr 1.5fr 4em",
        gap: 8,
        alignItems: "center",
        padding: "0 8px",
        borderBottom: "1px solid #eee",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.title}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.artistCredit}</span>
      <span data-year>{row.originalYear}</span>
    </div>
  );
}

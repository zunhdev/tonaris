// What the palette remembers on this device (DS-75): what was opened, newest first.

import { describe, expect, test } from "bun:test";

import { uuidv7 } from "@tonaris/domain";

import { openedItems, recentLimit, withRecent, type RecentItem } from "./device";

describe("recent items (DS-75)", () => {
  const [folder, list, album] = [uuidv7(), uuidv7(), uuidv7()];

  test("a view and the inspector's album, in the order they were opened", () => {
    expect(openedItems(`/l/${list}`, album)).toEqual([
      { kind: "list", id: list },
      { kind: "album", id: album },
    ]);
    expect(openedItems(`/f/${folder}`, undefined)).toEqual([{ kind: "folder", id: folder }]);
    expect(openedItems(`/a/${album}`, undefined)).toEqual([{ kind: "album", id: album }]);
    expect(openedItems("/unsorted", album)).toEqual([{ kind: "album", id: album }]);
    expect(openedItems("/c", undefined)).toEqual([]);
    expect(openedItems("/l/not-an-id", "nor-this")).toEqual([]);
  });

  test("newest first, each once, at most the limit", () => {
    const opened: RecentItem[] = [
      { kind: "list", id: list },
      { kind: "album", id: album },
      { kind: "list", id: list },
    ];
    expect(opened.reduce(withRecent, [])).toEqual([
      { kind: "list", id: list },
      { kind: "album", id: album },
    ]);
    const many = Array.from({ length: recentLimit + 5 }, (): RecentItem => ({
      kind: "album",
      id: uuidv7(),
    }));
    const kept = many.reduce(withRecent, []);
    expect(kept).toHaveLength(recentLimit);
    expect(kept[0]).toEqual(many.at(-1));
  });
});

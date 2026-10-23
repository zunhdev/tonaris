// What a view shows: its own choices, else the account defaults (FR-05.2, FR-11.7, DS-44).

import { describe, expect, test } from "bun:test";

import { appViewDefaults, unsetView, type ViewPrefs } from "@tonaris/domain";

import { defaultsFrom, presentationOf } from "./presentation";

const view = (values: Partial<ViewPrefs>): ViewPrefs => ({ ...unsetView("unsorted"), ...values });

describe("a view's presentation (FR-11.7)", () => {
  test("a view with no choice shows DS-44's first-time defaults", () => {
    expect(presentationOf("albums", undefined, appViewDefaults)).toEqual({
      sortMode: "year",
      sortDir: "asc",
      grouped: false,
      layout: "rows",
    });
    expect(presentationOf("containers", undefined, appViewDefaults)).toEqual({
      sortMode: "manual",
      sortDir: "asc",
      grouped: false,
      layout: "rows",
    });
  });

  test("a remembered sort wins over the defaults, and unset choices follow them", () => {
    const defaults = { ...appViewDefaults, listSortMode: "name" as const, grouped: true };
    expect(presentationOf("albums", undefined, defaults).sortMode).toBe("name");
    expect(presentationOf("albums", view({ sortMode: "year", sortDir: "desc" }), defaults)).toEqual(
      { sortMode: "year", sortDir: "desc", grouped: true, layout: "rows" },
    );
    expect(presentationOf("albums", view({ grouped: false, layout: "grid" }), defaults)).toEqual({
      sortMode: "name",
      sortDir: "asc",
      grouped: false,
      layout: "grid",
    });
  });

  test("folders and the root are always combined, in rows, whatever is stored", () => {
    expect(
      presentationOf(
        "containers",
        view({ sortMode: "created", sortDir: "desc", grouped: true, layout: "grid" }),
        { ...appViewDefaults, grouped: true, layout: "grid" },
      ),
    ).toEqual({ sortMode: "created", sortDir: "desc", grouped: false, layout: "rows" });
  });

  test("a mode the view's kind doesn't take gives way to the default", () => {
    expect(
      presentationOf("containers", view({ sortMode: "year", sortDir: "desc" }), appViewDefaults),
    ).toMatchObject({ sortMode: "manual", sortDir: "asc" });
  });

  test("saving as the default takes the choices of the view's kind", () => {
    const shown = presentationOf("albums", view({ grouped: true }), appViewDefaults);
    expect(defaultsFrom("albums", shown)).toEqual({
      listSortMode: "year",
      listSortDir: "asc",
      grouped: true,
      layout: "rows",
    });
    expect(
      defaultsFrom("containers", presentationOf("containers", undefined, appViewDefaults)),
    ).toEqual({ folderSortMode: "manual", folderSortDir: "asc" });
  });
});

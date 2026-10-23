// The order, grouping and year of a view's contents (FR-05.1, FR-05.5–FR-05.9, DS-24, DS-42–DS-44).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Album, type Container } from "@tonaris/domain";

import { chronology, groupOf, sections, sortAlbums, sortContainers, sortYear } from "./order";

const album = (title: string, values: Partial<Album> = {}): Album => ({
  id: uuidv7(),
  title,
  artistCredit: "Candlemass",
  releaseType: "album",
  isLive: false,
  originalYear: 1986,
  recordingYearStart: null,
  recordingYearEnd: null,
  ...values,
});

const titles = (albums: readonly Album[]) => albums.map((each) => each.title);

describe("the chronological year (FR-05.5, FR-05.6)", () => {
  test("live albums sort by their recording year, others and live ones without it by their original year", () => {
    expect(sortYear(album("Studio", { originalYear: 1987 }))).toBe(1987);
    expect(
      sortYear(album("Live", { isLive: true, originalYear: 1990, recordingYearStart: 1988 })),
    ).toBe(1988);
    expect(sortYear(album("Live, unknown", { isLive: true, originalYear: 1990 }))).toBe(1990);
    expect(sortYear(album("Unknown", { originalYear: null }))).toBeNull();
  });

  test("a recording range sorts by its start, in both directions", () => {
    const rainbow = album("Live at the Rainbow", {
      isLive: true,
      originalYear: 1984,
      recordingYearStart: 1978,
      recordingYearEnd: 1982,
    });
    const heaven = album("Heaven and Hell", { originalYear: 1980 });
    expect(titles(sortAlbums([heaven, rainbow], { mode: "year", dir: "asc" }))).toEqual([
      "Live at the Rainbow",
      "Heaven and Hell",
    ]);
    expect(titles(sortAlbums([rainbow, heaven], { mode: "year", dir: "desc" }))).toEqual([
      "Heaven and Hell",
      "Live at the Rainbow",
    ]);
  });
});

describe("sorting albums (FR-05.1)", () => {
  const unknown = album("Unknown", { originalYear: null });
  const nightfall = album("Nightfall", { originalYear: 1987 });
  const live = album("Live in Stockholm", {
    isLive: true,
    originalYear: 1990,
    recordingYearStart: 1985,
  });
  const epicus = album("epicus doomicus", { originalYear: 1986 });
  const ancient = album("Äncient Dreams", { originalYear: 1986 });

  test("by year: earliest first, unknown years last, ties by title ignoring case and accents, then by ID", () => {
    const twin = album("Nightfall", { id: epicus.id.replace(/.$/, "0"), originalYear: 1987 });
    expect(
      titles(sortAlbums([unknown, nightfall, live, epicus, ancient], { mode: "year", dir: "asc" })),
    ).toEqual(["Live in Stockholm", "Äncient Dreams", "epicus doomicus", "Nightfall", "Unknown"]);
    const ids = sortAlbums([nightfall, twin], { mode: "year", dir: "asc" }).map((each) => each.id);
    expect(ids).toEqual([nightfall.id, twin.id].toSorted());
  });

  test("by year, descending: latest first, unknown years still last, ties still by title", () => {
    expect(
      titles(
        sortAlbums([unknown, nightfall, live, epicus, ancient], { mode: "year", dir: "desc" }),
      ),
    ).toEqual(["Nightfall", "Äncient Dreams", "epicus doomicus", "Live in Stockholm", "Unknown"]);
  });

  test("by name, in both directions, ties by artist", () => {
    const tales = album("Tales of Creation");
    const otherNightfall = album("Nightfall", { artistCredit: "Black Sabbath" });
    expect(titles(sortAlbums([tales, nightfall, ancient], { mode: "name", dir: "desc" }))).toEqual([
      "Tales of Creation",
      "Nightfall",
      "Äncient Dreams",
    ]);
    expect(
      sortAlbums([nightfall, otherNightfall], { mode: "name", dir: "asc" }).map(
        (each) => each.artistCredit,
      ),
    ).toEqual(["Black Sabbath", "Candlemass"]);
  });

  test("manual keeps the order the view supplies, whatever the direction", () => {
    expect(titles(sortAlbums([nightfall, ancient, live], { mode: "manual", dir: "desc" }))).toEqual(
      ["Nightfall", "Äncient Dreams", "Live in Stockholm"],
    );
  });
});

const made = (kind: Container["kind"], name: string): Container => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
});

const names = (containers: readonly Container[]) => containers.map((each) => each.name);

describe("sorting folders and lists (FR-05.1, DS-42)", () => {
  const later = made("list", "Later");
  const metal = made("folder", "Metal");
  const archive = made("folder", "archive");
  const doom = made("list", "Doom");

  test("by name: folders first, then lists, each by name ignoring case", () => {
    expect(
      names(sortContainers([later, metal, archive, doom], { mode: "name", dir: "asc" })),
    ).toEqual(["archive", "Metal", "Doom", "Later"]);
    expect(
      names(sortContainers([later, metal, archive, doom], { mode: "name", dir: "desc" })),
    ).toEqual(["Metal", "archive", "Later", "Doom"]);
  });

  test("by creation date: folders first, then lists, each in the order they were made", () => {
    expect(
      names(sortContainers([doom, archive, later, metal], { mode: "created", dir: "asc" })),
    ).toEqual(["Metal", "archive", "Later", "Doom"]);
    expect(
      names(sortContainers([doom, archive, later, metal], { mode: "created", dir: "desc" })),
    ).toEqual(["archive", "Metal", "Doom", "Later"]);
  });

  test("manual before arranging: one mixed sequence in creation order (DS-44)", () => {
    expect(
      names(sortContainers([doom, metal, later, archive], { mode: "manual", dir: "desc" })),
    ).toEqual(["Later", "Metal", "archive", "Doom"]);
  });
});

describe("release-type groups (FR-05.7–FR-05.9, DS-43)", () => {
  test("live comes before any type, and singles and unknown types are Unclassified", () => {
    expect(groupOf({ isLive: true, releaseType: "ep" })).toBe("live");
    expect(groupOf({ isLive: true, releaseType: "compilation" })).toBe("live");
    expect(groupOf({ isLive: true, releaseType: null })).toBe("live");
    expect(groupOf({ isLive: false, releaseType: "ep" })).toBe("ep");
    expect(groupOf({ isLive: null, releaseType: "compilation" })).toBe("compilation");
    expect(groupOf({ isLive: false, releaseType: null })).toBe("unclassified");
  });

  test("groups come in the fixed sequence, empty ones gone, each in the sorted order", () => {
    const studio = album("Nightfall");
    const liveEp = album("Live EP", { isLive: true, releaseType: "ep" });
    const single = album("Samarithan", { releaseType: null });
    const best = album("The Best Of", { releaseType: "compilation" });
    const ancient = album("Ancient Dreams");
    const sorted = [studio, liveEp, single, best, ancient];
    expect(sections(sorted, true).map(({ group, albums }) => [group, titles(albums)])).toEqual([
      ["album", ["Nightfall", "Ancient Dreams"]],
      ["live", ["Live EP"]],
      ["compilation", ["The Best Of"]],
      ["unclassified", ["Samarithan"]],
    ]);
  });

  test("combined, every album stays in one sequence, unknown types in the flow", () => {
    const single = album("Samarithan", { releaseType: null });
    const studio = album("Nightfall");
    expect(sections([single, studio], false)).toEqual([
      { group: undefined, albums: [single, studio] },
    ]);
  });
});

describe("the year shown (DS-24)", () => {
  test("non-live albums show their original year", () => {
    expect(chronology(album("Studio"))).toEqual({ year: "1986", recorded: false, fallback: false });
  });

  test("a live recording year or range is marked as recorded", () => {
    expect(
      chronology(
        album("Range", { isLive: true, recordingYearStart: 1978, recordingYearEnd: 1982 }),
      ),
    ).toEqual({ year: "1978–1982", recorded: true, fallback: false });
    expect(
      chronology(
        album("One year", { isLive: true, recordingYearStart: 1988, recordingYearEnd: 1988 }),
      ),
    ).toEqual({ year: "1988", recorded: true, fallback: false });
  });

  test("a live album without a recording year shows its release year as the fallback", () => {
    expect(chronology(album("Live", { isLive: true, originalYear: 1979 }))).toEqual({
      year: "1979",
      recorded: false,
      fallback: true,
    });
    expect(chronology(album("Unknown", { originalYear: null }))).toEqual({
      year: "—",
      recorded: false,
      fallback: false,
    });
  });
});

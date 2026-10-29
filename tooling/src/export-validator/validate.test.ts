// The export validator (AC-41, TS-121): the seeded archive passes, and each way an archive can be wrong is caught. A
// file missing, a key the schema doesn't name, an album twice, a dangling entry, unmarked Trash, a stale schema, and
// not a ZIP at all.

import { describe, expect, test } from "bun:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  buildExport,
  exportFiles,
  exportSchema,
  uuidv7,
  type TonarisExport,
} from "@tonaris/domain";

import { seededArchive, seededSource } from "./seeded";
import { validateArchive } from "./validate";

/** The seeded archive with its data changed by `change`, or its files by `files`. */
function tampered(
  change: (data: TonarisExport & Record<string, unknown>) => void,
  files: (files: Record<string, string>) => void = () => {},
): Uint8Array {
  const data = buildExport(seededSource(), () => true);
  change(data);
  const contents = Object.fromEntries(exportFiles(data));
  files(contents);
  return zipSync(
    Object.fromEntries(Object.entries(contents).map(([name, text]) => [name, strToU8(text)])),
  );
}

describe("validateArchive", () => {
  test("the seeded archive is valid", () => {
    expect(validateArchive(seededArchive())).toEqual([]);
  });

  test("the seeded archive holds every part of the format", () => {
    const data = exportSchema.parse(
      JSON.parse(strFromU8(unzipSync(seededArchive())["tonaris-export.json"]!)),
    );
    expect(new Set(data.albums.map((album) => album.status))).toEqual(
      new Set(["active", "trashed"]),
    );
    expect(new Set(data.trash.units.map((unit) => unit.kind))).toEqual(
      new Set(["folder", "album"]),
    );
    expect(new Set(data.fields.map((field) => field.type)).size).toBe(6);
    expect(Object.keys(data.personal.views)).toContain("root");
  });

  test("a missing file", () => {
    expect(
      validateArchive(
        tampered(
          () => {},
          (files) => delete files["README.md"],
        ),
      ),
    ).toEqual(["The archive has no README.md."]);
  });

  test("a key the schema doesn't name, such as an email", () => {
    const problems = validateArchive(
      tampered((data) => {
        Object.assign(data.albums[0]!, { email: "anna@example.com" });
      }),
    );
    expect(problems.join("\n")).toContain("must NOT have additional properties");
  });

  test("an album twice, and an entry naming a missing album", () => {
    const problems = validateArchive(
      tampered((data) => {
        data.albums.push(data.albums[0]!);
        data.tree.containers
          .find((container) => container.kind === "list")!
          .albumIds.push(uuidv7());
      }),
    );
    expect(problems).toContainEqual(expect.stringMatching(/^Album .* appears more than once\.$/));
    expect(problems).toContainEqual(expect.stringMatching(/^List .* names a missing album, /));
  });

  test("Trash that isn't marked", () => {
    const problems = validateArchive(
      tampered((data) => {
        const trashed = data.albums.find((album) => album.status === "trashed")!;
        trashed.trashUnitId = null;
      }),
    );
    expect(problems).toContainEqual(
      expect.stringMatching(/^Album .* is trashed but in no unit\.$/),
    );
    expect(problems).toContainEqual(
      expect.stringMatching(/^Unit .* lists .*, which isn't in it\.$/),
    );
  });

  test("a schema that isn't the format's", () => {
    const problems = validateArchive(
      tampered(
        () => {},
        (files) => {
          const schema = JSON.parse(files["tonaris-export.schema.json"]!);
          files["tonaris-export.schema.json"] = JSON.stringify(
            Object.assign(schema, { title: "Something else" }),
          );
        },
      ),
    );
    expect(problems).toEqual(["tonaris-export.schema.json isn't format 1.0's schema."]);
  });

  test("not a ZIP", () => {
    expect(validateArchive(strToU8("not a zip"))[0]).toStartWith(
      "The archive isn't a readable ZIP",
    );
  });
});

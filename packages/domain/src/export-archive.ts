// The export archive's files (FR-08.2, TS-80), in the order the ZIP lists them: the data, its JSON Schema, the
// readable outline and the guide. The API zips them for the download; the export validator builds its seeded archive
// from them too, so both check the same files.

import { exportJsonSchema, type TonarisExport } from "./export";
import { renderCollection } from "./export-markdown";
import { exportReadme } from "./export-readme";

export const exportFileNames = [
  "tonaris-export.json",
  "tonaris-export.schema.json",
  "collection.md",
  "README.md",
] as const;

/** The archive's files for `data`, as names and text. The JSON files are indented for reading. */
export function exportFiles(data: TonarisExport): [(typeof exportFileNames)[number], string][] {
  return [
    ["tonaris-export.json", `${JSON.stringify(data, null, 2)}\n`],
    ["tonaris-export.schema.json", `${JSON.stringify(exportJsonSchema(), null, 2)}\n`],
    ["collection.md", renderCollection(data)],
    ["README.md", exportReadme(data)],
  ];
}

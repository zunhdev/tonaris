import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
  bunRunCommands,
  checkReferences,
  definedIds,
  errorCodeDrift,
  repositoryPath,
  specErrorCodes,
} from "./references";

const rootDir = path.resolve(import.meta.dir, "../../..");

describe("definedIds", () => {
  test("reads headings, bold paragraphs, table rows and retired IDs", () => {
    const markdown = [
      "### FR-01 — Lists, folders, Unsorted, and Trash",
      "**FR-01.2 Folders.** Folders hold lists.",
      "| AC-07 | Share a list | … |",
      "- **retired FR-02.7** (edition enrichment)",
      "Cites TS-09 without defining it.",
    ].join("\n");
    expect([...definedIds(markdown)].toSorted()).toEqual(["AC-07", "FR-01", "FR-01.2", "FR-02.7"]);
  });
});

describe("repositoryPath", () => {
  test("keeps repository paths and drops a line number or anchor", () => {
    expect(repositoryPath("apps/web/src/start.ts")).toBe("apps/web/src/start.ts");
    expect(repositoryPath("apps/web/src/start.ts:12")).toBe("apps/web/src/start.ts");
    expect(repositoryPath("docs/deploy.md#feedback-board")).toBe("docs/deploy.md");
    expect(repositoryPath("packages/ui/")).toBe("packages/ui");
  });

  test("skips placeholders, globs, commands and other tokens", () => {
    expect(repositoryPath("openspec/changes/<name>/")).toBeUndefined();
    expect(repositoryPath("tooling/src/spikes/**")).toBeUndefined();
    expect(repositoryPath("apps/api/openapi/{v1}.json")).toBeUndefined();
    expect(repositoryPath("docs/… and more")).toBeUndefined();
    expect(repositoryPath("bun run check")).toBeUndefined();
    expect(repositoryPath("src/app.ts")).toBeUndefined();
  });
});

describe("bunRunCommands", () => {
  test("reads the script and the --cwd folder", () => {
    expect(bunRunCommands("Run `bun run check`, then `bun run --cwd apps/web test:perf`.")).toEqual(
      [
        { script: "check", cwd: undefined },
        { script: "test:perf", cwd: "apps/web" },
      ],
    );
  });
});

describe("specErrorCodes", () => {
  test("reads the codes each bullet names outside parentheses and before a colon, and stops after the list", () => {
    const spec = [
      "Statuses: `failed`, `conflict`.",
      "",
      "Error `code`s:",
      "",
      "- `validation_failed`, `required_missing`",
      "- `unauthenticated` (401: no valid session or `token`), `permission_denied`",
      "- `internal_error`: an unexpected fault, unlike `not_a_code`",
      "",
      "- `after_the_list`",
    ].join("\n");
    expect(specErrorCodes(spec)).toEqual([
      "validation_failed",
      "required_missing",
      "unauthenticated",
      "permission_denied",
      "internal_error",
    ]);
    expect(specErrorCodes("No list here.")).toBeUndefined();
  });

  test("errorCodeDrift names a code on either side only", () => {
    expect(
      errorCodeDrift(["a", "b"], ["a", "c"]).map(({ detail }) => detail.split(" ")[0]),
    ).toEqual(["c", "b"]);
  });
});

describe("repository", () => {
  test("has no IDs, paths, scripts, OpenSpec changes or error codes that point nowhere", async () => {
    expect(await checkReferences(rootDir)).toEqual([]);
  });
});

// Descriptions' simple Markdown (FR-03.5, DS-41, TON-292): bold, italic, lists and http(s) links, everything else as
// written; the first line without marks for rows; and the export's escaped Markdown.

import { describe, expect, test } from "bun:test";

import {
  descriptionExcerpt,
  descriptionMarkdown,
  parseDescription,
  plainText,
  type DescriptionBlock,
} from "./description-markdown";

const text = (value: string) => ({ kind: "text", text: value }) as const;
const one = (source: string) => {
  const [block] = parseDescription(source);
  if (block?.kind !== "paragraph") throw new Error("Expected one paragraph");
  return block.lines[0];
};

describe("parseDescription", () => {
  test("bold and italic, with stars or underscores", () => {
    expect(one("**Start** with *The Seer* or _To Be Kind_")).toEqual([
      { kind: "strong", children: [text("Start")] },
      text(" with "),
      { kind: "em", children: [text("The Seer")] },
      text(" or "),
      { kind: "em", children: [text("To Be Kind")] },
    ]);
  });

  test("marks inside marks", () => {
    expect(one("*a **b** c*")).toEqual([
      { kind: "em", children: [text("a "), { kind: "strong", children: [text("b")] }, text(" c")] },
    ]);
    expect(one("***both***")).toEqual([
      { kind: "strong", children: [{ kind: "em", children: [text("both")] }] },
    ]);
  });

  test("marks that open nothing stay text", () => {
    for (const source of ["*NSYNC fan", "2 * 3 * 4", "snake_case_name", "** not bold**", "a*"])
      expect(one(source)).toEqual([text(source)]);
  });

  test("a backslash keeps a mark as text", () => {
    expect(one(String.raw`\*not italic\*`)).toEqual([text("*not italic*")]);
  });

  test("links to http and https addresses, bare or with text", () => {
    expect(one("More on [Wikipedia](https://en.wikipedia.org/wiki/Swans_(band)).")).toEqual([
      text("More on "),
      {
        kind: "link",
        href: "https://en.wikipedia.org/wiki/Swans_(band)",
        children: [text("Wikipedia")],
      },
      text("."),
    ]);
    expect(one("See https://swans.example/tour, then (http://a.example/b).")).toEqual([
      text("See "),
      {
        kind: "link",
        href: "https://swans.example/tour",
        children: [text("https://swans.example/tour")],
      },
      text(", then ("),
      { kind: "link", href: "http://a.example/b", children: [text("http://a.example/b")] },
      text(")."),
    ]);
  });

  test("any other address stays text", () => {
    for (const source of [
      "[x](javascript:alert(1))",
      "[x](data:text/html,hi)",
      "[x](mailto:a@b.example)",
      "[x](/relative)",
      "[](https://a.example)",
      "javascript:alert(1)",
    ])
      expect(plainText(one(source) ?? [])).toBe(source);
    expect(one("[x](javascript:alert(1))")?.some((run) => run.kind === "link")).toBe(false);
  });

  test("no link inside a link's text", () => {
    expect(one("[see https://b.example](https://a.example)")).toEqual([
      {
        kind: "link",
        href: "https://a.example",
        children: [text("see https://b.example")],
      },
    ]);
  });

  test("lines keep their breaks; blank lines make paragraphs", () => {
    expect(parseDescription("Seattle, 1988 to 1994\nLoud and sludgy.\n\nThe end.")).toEqual([
      { kind: "paragraph", lines: [[text("Seattle, 1988 to 1994")], [text("Loud and sludgy.")]] },
      { kind: "paragraph", lines: [[text("The end.")]] },
    ]);
  });

  test("bulleted and numbered lists, with indented lines going on", () => {
    const blocks: DescriptionBlock[] = parseDescription(
      "Start here:\n- Filth\n* Cop\n  and Young God\n+ Greed\n\n3. Children of God\n4) The Burning World",
    );
    expect(blocks).toEqual([
      { kind: "paragraph", lines: [[text("Start here:")]] },
      {
        kind: "list",
        ordered: false,
        start: 1,
        items: [[[text("Filth")]], [[text("Cop")], [text("and Young God")]], [[text("Greed")]]],
      },
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: [[[text("Children of God")]], [[text("The Burning World")]]],
      },
    ]);
  });

  test("a year followed by a full stop isn't a list", () => {
    expect(parseDescription("1994. The year it all went loud.")).toEqual([
      { kind: "paragraph", lines: [[text("1994. The year it all went loud.")]] },
    ]);
  });

  test("text after a list starts a paragraph", () => {
    expect(parseDescription("- one\nafter").map((block) => block.kind)).toEqual([
      "list",
      "paragraph",
    ]);
  });
});

describe("descriptionExcerpt", () => {
  test("the first line without its marks", () => {
    expect(descriptionExcerpt("**Start** with [*The Seer*](https://a.example)\nsecond")).toBe(
      "Start with The Seer",
    );
    expect(descriptionExcerpt("\n\n- Filth\n- Cop")).toBe("Filth");
    expect(descriptionExcerpt("")).toBe("");
  });
});

describe("descriptionMarkdown", () => {
  test("keeps its own marks, and escapes any other Markdown", () => {
    expect(
      descriptionMarkdown(
        "**Start** with *The Seer*\n# not a heading\n---\n\n- Filth\n- [Wiki](https://a.example/b_(c))",
      ),
    ).toBe(
      [
        "**Start** with *The Seer*\\",
        "\\# not a heading\\",
        "\\---",
        "",
        "- Filth",
        "- [Wiki](<https://a.example/b_(c)>)",
      ].join("\n"),
    );
  });

  test("numbered lists keep their numbers, and a year stays text", () => {
    expect(descriptionMarkdown("2. two\n3. three\n\n1994. A year")).toBe(
      ["2. two", "3. three", "", "1994\\. A year"].join("\n"),
    );
  });

  test("a list item's lines are hard breaks under its text", () => {
    expect(descriptionMarkdown("- Cop\n  and Young God")).toBe("- Cop\\\n  and Young God");
  });
});

// The description panel's marks (DS-41, TON-292): bold and italic wrap and unwrap, links take the selection as text
// or address, and the list buttons mark whole lines and take the marks off again.

import { describe, expect, test } from "bun:test";

import { markEdit, type Mark } from "./description-marks";

/** The text after the edit, with the selection shown as [ and ]. */
function apply(text: string, start: number, end: number, mark: Mark): string {
  const edit = markEdit(text, start, end, mark);
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  const [a, b] = edit.select;
  return `${next.slice(0, a)}[${next.slice(a, b)}]${next.slice(b)}`;
}

describe("markEdit", () => {
  test("bold and italic wrap the selection, or a placeholder", () => {
    expect(apply("Start with The Seer", 0, 5, "bold")).toBe("**[Start]** with The Seer");
    expect(apply("Start with The Seer", 11, 19, "italic")).toBe("Start with *[The Seer]*");
    expect(apply("Start ", 6, 6, "bold")).toBe("Start **[bold text]**");
  });

  test("they take their marks off text already wrapped", () => {
    expect(apply("**Start** here", 2, 7, "bold")).toBe("[Start] here");
    expect(apply("*Start* here", 1, 6, "italic")).toBe("[Start] here");
  });

  test("italic inside bold adds its own marks rather than taking bold's", () => {
    expect(apply("**Start**", 2, 7, "italic")).toBe("***[Start]***");
  });

  test("a link takes the selection as its text, then selects the address to type", () => {
    expect(apply("More on Wikipedia.", 8, 17, "link")).toBe("More on [Wikipedia]([https://]).");
  });

  test("a selected address becomes the link's address", () => {
    expect(apply("See https://a.example", 4, 21, "link")).toBe(
      "See [[link text]](https://a.example)",
    );
  });

  test("the list buttons mark each line, and unmark them again", () => {
    expect(apply("Filth\nCop\nGreed", 2, 12, "bullets")).toBe("- Filth\n- Cop\n- Greed[]");
    expect(apply("- Filth\n- Cop", 0, 13, "bullets")).toBe("Filth\nCop[]");
    expect(apply("Filth\n- Cop", 0, 11, "numbers")).toBe("1. Filth\n2. Cop[]");
    expect(apply("Intro\nFilth", 8, 8, "bullets")).toBe("Intro\n- Filth[]");
  });

  test("a list started on an empty line leaves the caret after its mark", () => {
    expect(apply("Intro\n", 6, 6, "bullets")).toBe("Intro\n- []");
  });
});

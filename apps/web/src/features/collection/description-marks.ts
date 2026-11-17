// What the description panel's buttons, ⌘B and ⌘I do to its text (DS-41, TON-292): bold and italic wrap the
// selection in their marks, or take them off text already wrapped; a link wraps it as the link's text, or as its
// address when it is one; the list buttons start each selected line with "- " or "1. ", or take that off again.
// Each answers the span to replace, its new text, and what to select after, so the text box can make it one edit.

export type Mark = "bold" | "italic" | "link" | "bullets" | "numbers";

export type MarkEdit = {
  /** The span replaced, from and to, in the old text. */
  from: number;
  to: number;
  insert: string;
  /** What is selected afterwards, in the new text. */
  select: [number, number];
};

const wrappers = { bold: "**", italic: "*" } as const;
const placeholders = { bold: "bold text", italic: "italic text", link: "link text" } as const;
const listMark = /^(?:[-*+]|\d{1,3}[.)])[ \t]+/;

export function markEdit(text: string, start: number, end: number, mark: Mark): MarkEdit {
  const selected = text.slice(start, end);
  if (mark === "bold" || mark === "italic") {
    const wrapper = wrappers[mark];
    const width = wrapper.length;
    const before = text.slice(start - width, start);
    const after = text.slice(end, end + width);
    // Italic's single star isn't one of bold's two.
    const lone = mark === "bold" || (text[start - width - 1] !== "*" && text[end + width] !== "*");
    if (selected !== "" && before === wrapper && after === wrapper && lone)
      return {
        from: start - width,
        to: end + width,
        insert: selected,
        select: [start - width, end - width],
      };
    const inner = selected || placeholders[mark];
    return {
      from: start,
      to: end,
      insert: `${wrapper}${inner}${wrapper}`,
      select: [start + width, start + width + inner.length],
    };
  }
  if (mark === "link") {
    // A selected address becomes the link's address, and its text is what to type next.
    if (/^https?:\/\/\S+$/i.test(selected)) {
      const insert = `[${placeholders.link}](${selected})`;
      return {
        from: start,
        to: end,
        insert,
        select: [start + 1, start + 1 + placeholders.link.length],
      };
    }
    const inner = selected || placeholders.link;
    const address = start + inner.length + 3;
    return {
      from: start,
      to: end,
      insert: `[${inner}](https://)`,
      select: [address, address + "https://".length],
    };
  }
  // Lists take whole lines.
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end > start && text[end - 1] === "\n" ? end - 1 : end);
  const to = lineEnd === -1 ? text.length : lineEnd;
  const lines = text.slice(from, to).split("\n");
  const marked = (line: string) =>
    mark === "bullets" ? /^[-*+][ \t]+/.test(line) : /^\d{1,3}[.)][ \t]+/.test(line);
  const written = lines.filter((line) => line.trim() !== "");
  const off = written.length > 0 && written.every(marked);
  let number = 0;
  const insert = lines
    .map((line) => {
      if (off) return line.replace(listMark, "");
      if (line.trim() === "" && lines.length > 1) return line;
      number += 1;
      return `${mark === "bullets" ? "- " : `${number}. `}${line.replace(listMark, "")}`;
    })
    .join("\n");
  const caret = from + insert.length;
  return { from, to, insert, select: [caret, caret] };
}

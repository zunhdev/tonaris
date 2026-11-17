// A folder's or list's description in simple Markdown (FR-03.5, DS-41, TON-292): **bold**, *italic* or _italic_,
// bulleted and numbered lists, and links to http and https addresses, written [text](https://…) or bare. Everything
// else is text as written, its line breaks kept. One parser serves every place a description shows: the app and guest
// pages render its tree with React, never as HTML made from the text (TS-101); rows show its first line without the
// marks; the export's readable copy writes it back as escaped Markdown, so only these marks render there.

/** A run of a line: text, or marked text. */
export type DescriptionInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: DescriptionInline[] }
  | { kind: "em"; children: DescriptionInline[] }
  | { kind: "link"; href: string; children: DescriptionInline[] };

/** One line of a paragraph or of a list item. */
export type DescriptionLine = DescriptionInline[];

/** A paragraph, its lines as written; or a list, each item one or more lines. */
export type DescriptionBlock =
  | { kind: "paragraph"; lines: DescriptionLine[] }
  | { kind: "list"; ordered: boolean; start: number; items: DescriptionLine[][] };

const bullet = /^ {0,3}[-*+][ \t]+(\S.*)$/;
// Up to three digits, so that a line such as "1994. The year…" stays text.
const numbered = /^ {0,3}(\d{1,3})[.)][ \t]+(\S.*)$/;
// An indented line goes on with the list item above it.
const continued = /^(?: {2,}|\t)\s*(\S.*)$/;
const space = /\s/;
const wordChar = /[\p{L}\p{N}]/u;
const punctuation = /[!-/:-@[-`{-~]/;

/** The description's blocks: paragraphs and lists, split by blank lines. */
export function parseDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] | undefined;
  let list: { ordered: boolean; start: number; items: string[][] } | undefined;
  const end = () => {
    if (paragraph) blocks.push({ kind: "paragraph", lines: paragraph.map(parseLine) });
    if (list) {
      const items = list.items.map((item) => item.map(parseLine));
      blocks.push({ kind: "list", ordered: list.ordered, start: list.start, items });
    }
    paragraph = undefined;
    list = undefined;
  };
  for (const raw of text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      end();
      continue;
    }
    const point = bullet.exec(line);
    const number = point ? null : numbered.exec(line);
    if (point || number) {
      const ordered = number !== null;
      if (paragraph || (list && list.ordered !== ordered)) end();
      list ??= { ordered, start: number ? Number(number[1]) : 1, items: [] };
      list.items.push([(number ? number[2] : point?.[1]) ?? ""]);
      continue;
    }
    const more = list ? continued.exec(line) : null;
    const item = list?.items.at(-1);
    if (more && item) {
      item.push(more[1] ?? "");
      continue;
    }
    if (list) end();
    (paragraph ??= []).push(line.trimStart());
  }
  end();
  return blocks;
}

function parseLine(line: string): DescriptionLine {
  return parseInline(line, true);
}

/** A line's runs; inside a link's text, no further links. */
function parseInline(source: string, links: boolean): DescriptionInline[] {
  const runs: DescriptionInline[] = [];
  let text = "";
  const flush = () => {
    if (text) runs.push({ kind: "text", text });
    text = "";
  };
  let at = 0;
  while (at < source.length) {
    const char = source[at] ?? "";
    const next = source[at + 1] ?? "";
    // A backslash keeps the mark after it as text: \*
    if (char === "\\" && punctuation.test(next)) {
      text += next;
      at += 2;
      continue;
    }
    if (links && char === "[") {
      const link = linkAt(source, at);
      if (link) {
        flush();
        runs.push({ kind: "link", href: link.href, children: parseInline(link.label, false) });
        at = link.end;
        continue;
      }
    }
    if (
      links &&
      (char === "h" || char === "H") &&
      (at === 0 || /[\s(]/.test(source[at - 1] ?? ""))
    ) {
      const href = addressAt(source, at);
      if (href) {
        flush();
        runs.push({ kind: "link", href, children: [{ kind: "text", text: href }] });
        at += href.length;
        continue;
      }
    }
    if (char === "*" || char === "_") {
      const marked = emphasisAt(source, at);
      if (marked) {
        flush();
        runs.push({
          kind: marked.strong ? "strong" : "em",
          children: parseInline(marked.inner, links),
        });
        at = marked.end;
        continue;
      }
    }
    text += char;
    at += 1;
  }
  flush();
  return runs;
}

/** `**strong**`, `__strong__`, `*em*` or `_em_` opening at `at`, as CommonMark reads them, simplified. */
function emphasisAt(
  source: string,
  at: number,
): { strong: boolean; inner: string; end: number } | undefined {
  const mark = source[at] ?? "";
  const strong = source[at + 1] === mark;
  const width = strong ? 2 : 1;
  const first = source[at + width];
  if (first === undefined || space.test(first)) return undefined;
  // An underscore inside a word, as in snake_case, is text.
  if (mark === "_" && at > 0 && wordChar.test(source[at - 1] ?? "")) return undefined;
  for (let close = at + width + 1; close < source.length; close += 1) {
    const char = source[close];
    if (char === "\\") {
      close += 1;
      continue;
    }
    if (char !== mark) continue;
    // A strong run inside the italic text: step over its marks.
    if (!strong && source[close + 1] === mark) {
      close += 1;
      continue;
    }
    if (space.test(source[close - 1] ?? " ")) continue;
    if (strong) {
      if (source[close + 1] !== mark) continue;
      // "***x***": the strong closes on the last two.
      const end = source[close + 2] === mark ? close + 1 : close;
      if (mark === "_" && wordChar.test(source[end + 2] ?? "")) continue;
      return { strong, inner: source.slice(at + 2, end), end: end + 2 };
    }
    if (mark === "_" && wordChar.test(source[close + 1] ?? "")) continue;
    return { strong, inner: source.slice(at + 1, close), end: close + 1 };
  }
  return undefined;
}

/** Whether `href` is a whole http or https address: links lead nowhere else (TS-101). */
function webAddress(href: string): boolean {
  if (!/^https?:\/\/[^\s<>]+$/i.test(href)) return false;
  try {
    const url = new URL(href);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/** `[text](https://…)` opening at `at`; its address may hold balanced brackets, as Wikipedia's do. */
function linkAt(
  source: string,
  at: number,
): { label: string; href: string; end: number } | undefined {
  let close = at + 1;
  for (; close < source.length; close += 1) {
    const char = source[close];
    if (char === "\\") close += 1;
    else if (char === "[") return undefined;
    else if (char === "]") break;
  }
  if (source[close] !== "]" || source[close + 1] !== "(") return undefined;
  const label = source.slice(at + 1, close);
  if (label.trim() === "") return undefined;
  let depth = 0;
  let end = close + 2;
  for (; end < source.length; end += 1) {
    const char = source[end] ?? "";
    if (space.test(char)) return undefined;
    if (char === "(") depth += 1;
    else if (char === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  const href = source.slice(close + 2, end);
  if (source[end] !== ")" || !webAddress(href)) return undefined;
  return { label, href, end: end + 1 };
}

const count = (text: string, char: string) => text.split(char).length - 1;

/** A bare address opening at `at`, without the punctuation that ends its sentence. */
function addressAt(source: string, at: number): string | undefined {
  let href = /^https?:\/\/[^\s<>]+/i.exec(source.slice(at))?.[0];
  while (href) {
    const last = href.at(-1) ?? "";
    if (".,;:!?'\"*_".includes(last)) href = href.slice(0, -1);
    else if (last === ")" && count(href, "(") < count(href, ")")) href = href.slice(0, -1);
    else break;
  }
  return href && webAddress(href) ? href : undefined;
}

/** A line's words without its marks. */
export function plainText(runs: readonly DescriptionInline[]): string {
  return runs.map((run) => (run.kind === "text" ? run.text : plainText(run.children))).join("");
}

/** The description's first line without its marks, as a folder's rows show it (DS-41). */
export function descriptionExcerpt(text: string): string {
  const first = parseDescription(text)[0];
  const line = first?.kind === "paragraph" ? first.lines[0] : first?.items[0]?.[0];
  return line ? plainText(line).trim() : "";
}

const escaped = (text: string) => text.replace(/[\\`*_[\]<>|#~]/g, "\\$&");

function inlineMarkdown(runs: readonly DescriptionInline[]): string {
  return runs
    .map((run) => {
      if (run.kind === "text") return escaped(run.text);
      const inner = inlineMarkdown(run.children);
      if (run.kind === "strong") return `**${inner}**`;
      if (run.kind === "em") return `*${inner}*`;
      return `[${inner}](<${run.href}>)`;
    })
    .join("");
}

/** A line as Markdown that can't start a block of its own: a list, a quote or a heading's underline. */
function lineMarkdown(line: DescriptionLine): string {
  return inlineMarkdown(line)
    .replace(/^(\s*)(\d+)([.)])/, "$1$2\\$3")
    .replace(/^(\s*)([-+=>])/, "$1\\$2");
}

/**
 * The description as Markdown that renders as Tonaris shows it, for the export's readable copy (FR-08.2): its own
 * marks kept, any other Markdown escaped, its line breaks hard breaks.
 */
export function descriptionMarkdown(text: string): string {
  return parseDescription(text)
    .map((block) => {
      if (block.kind === "paragraph") return block.lines.map(lineMarkdown).join("\\\n");
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${block.start + index}.` : "-";
          const indent = " ".repeat(marker.length + 1);
          return `${marker} ${item.map(lineMarkdown).join(`\\\n${indent}`)}`;
        })
        .join("\n");
    })
    .join("\n\n");
}

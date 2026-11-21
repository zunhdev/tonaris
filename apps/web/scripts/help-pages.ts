// Help's page list (TS-136): reads every page under src/help/content/<section>/<name>.mdx and every picture under
// src/help/pictures/, checks them, and writes src/help/pages.gen.ts, as TanStack Router writes routeTree.gen.ts. The
// list gives the sidebar, the home and On this page what they need without loading a page, and the app typed slugs
// for its links into Help. A broken link between pages, a missing picture or a bad field stops the build.
// `bun --bun vite` keeps the file current while pages change; a test checks the committed one is (help-pages.test.ts).

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import GithubSlugger from "github-slugger";
import type { Plugin } from "vite";

import {
  helpDevices,
  helpSections,
  type HelpDevice,
  type HelpHeading,
  type HelpPageMeta,
  type HelpSectionId,
} from "../src/help/sections.ts";

const helpDir = fileURLToPath(new URL("../src/help", import.meta.url));
const contentDir = path.join(helpDir, "content");
const picturesDir = path.join(helpDir, "pictures");
const outFile = path.join(helpDir, "pages.gen.ts");

/** Help's pages that live outside content/, which pages may link to. */
const otherPages = new Set(["", "recovery", "search"]);

/**
 * Pages still being written (TON-309 to TON-313), which pages may already link to: Help isn't linked from anywhere
 * until TON-315. Each is taken off as it's written, and TON-313 empties the list.
 */
const plannedPages = new Set([
  "agents/what-agents-do",
  "agents/connect",
  "agents/approvals",
  "phone/on-your-phone",
  "reference/keyboard-shortcuts",
  "reference/services-and-links",
  "reference/limits",
  "reference/words",
  "help/questions",
  "help/get-in-touch",
]);

type Page = HelpPageMeta & { file: string; source: string };
type Picture = { name: string; file: string; width: number; height: number };

/** A frontmatter field's value, checked. */
function field<T>(file: string, name: string, value: unknown, ok: (v: unknown) => v is T): T {
  if (!ok(value)) throw new Error(`${file}: frontmatter "${name}" is missing or not valid`);
  return value;
}
const isString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === "string");
const isDevice = (v: unknown): v is HelpDevice =>
  typeof v === "string" && (helpDevices as readonly string[]).includes(v);

/** A heading's text as rehype-slug reads it: what shows, without Markdown's marks. */
function headingText(markdown: string): string {
  return markdown
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/\*\*|__|`/g, "")
    .replaceAll(/(^|\s)[*_]([^*_]+)[*_]/g, "$1$2")
    .trim();
}

/** The page's headings, with the ids rehype-slug gives them (every level counts towards repeats, as there). */
function headingsOf(file: string, source: string): HelpHeading[] {
  const slugger = new GithubSlugger();
  const found: HelpHeading[] = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const match = fenced ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const [, hashes = "", raw = ""] = match;
    if (raw.includes("<")) throw new Error(`${file}: a heading can't hold a component: ${raw}`);
    const text = headingText(raw);
    const id = slugger.slug(text);
    if (hashes.length === 2 || hashes.length === 3) {
      found.push({ id, text, depth: hashes.length === 2 ? 2 : 3 });
    }
  }
  return found;
}

const sectionOrder = (id: string) => helpSections.findIndex((section) => section.id === id);
const isSection = (id: string): id is HelpSectionId =>
  helpSections.some((section) => section.id === id);
const json = (value: unknown) => JSON.stringify(value);

/** The frontmatter between the opening `---` lines, and the rest. */
function split(file: string, text: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error(`${file}: a page starts with its frontmatter, between --- lines`);
  const parsed: unknown = Bun.YAML.parse(match[1] ?? "");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file}: the frontmatter isn't a set of fields`);
  }
  return { data: Object.fromEntries(Object.entries(parsed)), body: text.slice(match[0].length) };
}

async function readPages(): Promise<Page[]> {
  const pages: Page[] = [];
  for (const sectionDir of await readdir(contentDir, { withFileTypes: true })) {
    if (!sectionDir.isDirectory()) continue;
    const section = sectionDir.name;
    if (!isSection(section)) {
      throw new Error(`content/${section}: no such section in src/help/sections.ts`);
    }
    // One section at a time keeps the order of errors stable.
    // oxlint-disable-next-line no-await-in-loop
    for (const name of await readdir(path.join(contentDir, section))) {
      if (!name.endsWith(".mdx")) continue;
      const file = `content/${section}/${name}`;
      // One at a time keeps the order of errors stable.
      // oxlint-disable-next-line no-await-in-loop
      const source = await readFile(path.join(contentDir, section, name), "utf8");
      const { data, body } = split(file, source);
      pages.push({
        slug: `${section}/${name.slice(0, -".mdx".length)}`,
        section,
        title: field(file, "title", data.title, isString),
        summary: field(file, "summary", data.summary, isString),
        order: field(file, "order", data.order, isNumber),
        device: data.device === undefined ? "any" : field(file, "device", data.device, isDevice),
        keywords:
          data.keywords === undefined ? [] : field(file, "keywords", data.keywords, isStrings),
        related: data.related === undefined ? [] : field(file, "related", data.related, isStrings),
        headings: headingsOf(file, body),
        file,
        source: body,
      });
    }
  }
  return pages.toSorted(
    (a, b) =>
      sectionOrder(a.section) - sectionOrder(b.section) ||
      a.order - b.order ||
      a.title.localeCompare(b.title),
  );
}

/** A WebP's size in pixels, from its header: lossy, lossless or extended. */
function webpSize(file: string, bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
  if (chunk === "VP8 ") {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    const read24 = (at: number) => view.getUint16(at, true) + (view.getUint8(at + 2) << 16) + 1;
    return { width: read24(24), height: read24(27) };
  }
  throw new Error(`pictures/${file}: not a WebP file`);
}

async function readPictures(): Promise<Picture[]> {
  const pictures: Picture[] = [];
  for (const file of (await readdir(picturesDir)).toSorted()) {
    if (!file.endsWith(".webp")) continue;
    // oxlint-disable-next-line no-await-in-loop
    const bytes = new Uint8Array(await readFile(path.join(picturesDir, file)));
    pictures.push({ name: file.slice(0, -".webp".length), file, ...webpSize(file, bytes) });
  }
  return pictures;
}

/** Links between pages, and pictures, that point nowhere. */
function problems(pages: readonly Page[], pictures: readonly Picture[]): string[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const pictureNames = new Set(pictures.map((picture) => picture.name));
  const found = pages
    .filter((page) => plannedPages.has(page.slug))
    .map((page) => `${page.file}: written now, so take it off plannedPages`);
  for (const page of pages) {
    const links = [
      ...page.source.matchAll(/\]\(\/help\/?([^)\s#]*)(#[^)\s]*)?\)/g),
      ...page.source.matchAll(/href="\/help\/?([^"#]*)(#[^"]*)?"/g),
    ];
    for (const [, target = "", anchor] of links) {
      const linked = bySlug.get(target);
      if (!linked && !otherPages.has(target) && !plannedPages.has(target)) {
        found.push(`${page.file}: a link to /help/${target}, which isn't a page`);
      } else if (linked && anchor && !linked.headings.some((h) => `#${h.id}` === anchor)) {
        found.push(`${page.file}: a link to /help/${target}${anchor}, which isn't a heading there`);
      }
    }
    for (const slug of page.related) {
      if (!bySlug.has(slug) && !plannedPages.has(slug)) {
        found.push(`${page.file}: related page ${slug} doesn't exist`);
      }
    }
    for (const [, name = ""] of page.source.matchAll(/<Picture[^>]*\bname="([^"]+)"/g)) {
      // The pictures run builds the app before it takes the pictures pages ask for (playwright.pictures.config.ts).
      if (!pictureNames.has(name) && !process.env.HELP_PICTURES_PENDING) {
        found.push(`${page.file}: no picture pictures/${name}.webp`);
      }
    }
  }
  return found;
}

/** Pictures are taken at twice a computer's pixels, or three times a phone's (apps/web/pictures). */
const shownSize = ({ name, width, height }: Picture) => {
  const scale = name.startsWith("phone-") ? 3 : 2;
  return { width: Math.round(width / scale), height: Math.round(height / scale) };
};

/** pages.gen.ts as it should be now. */
export async function generateHelpPages(): Promise<string> {
  const [pages, pictures] = await Promise.all([readPages(), readPictures()]);
  const found = problems(pages, pictures);
  if (found.length > 0) throw new Error(`Help pages:\n${found.join("\n")}`);
  return [
    "// Generated by apps/web/scripts/help-pages.ts from src/help/content and src/help/pictures (TS-136). Don't edit",
    "// it by hand: `bun --bun vite` writes it as pages change, and a test checks it is current.",
    "",
    'import type { MDXContent } from "mdx/types";',
    "",
    'import type { HelpPageMeta } from "./sections";',
    ...pictures.map((picture, i) => `import picture${i} from "./pictures/${picture.file}";`),
    "",
    "export const helpPages = [",
    ...pages.map(({ file: _file, source: _source, ...meta }) => `  ${json(meta)},`),
    "] as const satisfies readonly HelpPageMeta[];",
    "",
    'export type HelpSlug = (typeof helpPages)[number]["slug"];',
    "",
    "/** Each page's content, loaded when it is shown. */",
    "export const helpContent: Record<HelpSlug, () => Promise<{ default: MDXContent }>> = {",
    ...pages.map((page) => `  ${json(page.slug)}: () => import("./${page.file}"),`),
    "};",
    "",
    "/** Each picture's address and the size it shows at. */",
    "export const helpPictures = {",
    ...pictures.map(
      (picture, i) =>
        `  ${json(picture.name)}: { src: picture${i}, ...${json(shownSize(picture))} },`,
    ),
    "} as const;",
    "",
    "export type HelpPictureName = keyof typeof helpPictures;",
    "",
  ].join("\n");
}

/** Writes pages.gen.ts when it changed; true if it did. */
export async function writeHelpPages(): Promise<boolean> {
  const next = await generateHelpPages();
  const current = await readFile(outFile, "utf8").catch(() => "");
  if (current === next) return false;
  await writeFile(outFile, next);
  return true;
}

/** Writes the page list before a build, and again as pages and pictures change in development. */
export function helpPages(): Plugin {
  return {
    name: "tonaris-help-pages",
    async buildStart() {
      await writeHelpPages();
    },
    configureServer(server) {
      server.watcher.on("all", (event, file) => {
        if (event !== "add" && event !== "change" && event !== "unlink") return;
        if (!file.startsWith(contentDir) && !file.startsWith(picturesDir)) return;
        writeHelpPages().catch((error: unknown) => {
          server.config.logger.error(String(error));
        });
      });
    },
  };
}

if (import.meta.main) {
  console.log(
    (await writeHelpPages()) ? "Wrote src/help/pages.gen.ts." : "pages.gen.ts is current.",
  );
}

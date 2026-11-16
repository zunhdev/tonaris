// What an album card's words need (DS-22, TON-280): whether its title and its artist each fit on one line at the
// card's width, and how many of its service links fit whole after its year. Both come from text widths in the card's
// fonts, measured on a canvas, so a whole list's row heights are known before any card is drawn, and the virtualized
// grid can give each row its own height.

import { narrowQuery } from "@/common/media";
import { useSyncExternalStore } from "react";

import { chronology, serviceNames, type Album, type StreamingService } from "@tonaris/domain";

/** The type a card's words are set in (DS-13): canvas fonts and line heights in px. */
export type CardType = {
  /** The title's. */
  title: string;
  /** The artist's, the year's and the links'. */
  small: string;
  /** "+N"'s. */
  smallStrong: string;
  titleLine: number;
  smallLine: number;
};

/** A text's width in px, in a canvas font. */
export type Measure = (text: string, font: string) => number;

/** A card's lines: its title on one or two, its artist on two only under a one-line title. */
export type CardLines = { title: 1 | 2; artist: 1 | 2 };

/** Room a width may be off by, so words judged to fit never end in an ellipsis. */
const slack = 2;

export function cardLines(
  album: Pick<Album, "title" | "artistCredit">,
  width: number,
  type: CardType,
  measure: Measure,
): CardLines {
  const fits = (text: string, font: string) => measure(text, font) <= width - slack;
  if (!fits(album.title, type.title)) return { title: 2, artist: 1 };
  return { title: 1, artist: fits(album.artistCredit, type.small) ? 1 : 2 };
}

/** Whether a card needs a third line of words, and so does every card in its row. */
export const fullCard = (lines: CardLines): boolean => lines.title + lines.artist > 2;

/**
 * The height of a card's words: the title's margin and the gaps above the title, artist and links, then two lines of
 * title, the artist's line and the links' line; a row with no full card has a title line less.
 */
export function wordsHeight(full: boolean, type: CardType): number {
  return 16 + (full ? 2 : 1) * type.titleLine + 2 * type.smallLine;
}

/** The icon before a folder's or list's name on its card, and the gap after it (`size-4`, `gap-1.5`). */
export const nameIndent = 22;

/** A folder's or list's name on its card: one line when it fits beside its icon, else two (TON-283). */
export function nameLines(name: string, width: number, type: CardType, measure: Measure): 1 | 2 {
  return measure(name, type.title) <= width - nameIndent - slack ? 1 : 2;
}

/**
 * The height of a folder or list card's words: the name's margin, its one or two lines, the gap, the count's line,
 * and room below it (DS-41).
 */
export function nameWordsHeight(lines: 1 | 2, type: CardType): number {
  return 16 + lines * type.titleLine + type.smallLine;
}

/** A link's arrow (`size-3` and `ml-px`), the space between links (`mr-2.5`), and "+N"'s padding (`px-1.5`). */
const arrow = 13;
const between = 10;
const morePadding = 12;

/** The year's gap after `rec.` and before the fallback marker, and the marker's icon (DS-24). */
const yearGap = 4;
const markerIcon = 14;

/** Digits are set tabular, each as wide as a zero; a canvas sets them proportional. */
const tabular = (text: string) => text.replaceAll(/\d/g, "0");

/** The width of a card's year before its links (DS-24), with the " · " after it when links follow. */
export function yearWidth(
  album: Parameters<typeof chronology>[0],
  withLinks: boolean,
  type: CardType,
  measure: Measure,
): number {
  const { year, recorded, fallback } = chronology(album);
  let width = measure(tabular(year), type.small);
  if (recorded) width += measure("rec.", type.small) + yearGap;
  if (fallback) width += 2 * yearGap + measure("·", type.small) + markerIcon;
  return withLinks ? width + measure(" · ", type.small) : width;
}

/**
 * How many of `services` (in their order) fit whole on a `width` px line after `lead` px, leaving room for "+N" when
 * some don't. None may fit, leaving "+N" alone.
 */
export function linksThatFit(
  services: readonly StreamingService[],
  lead: number,
  width: number,
  type: CardType,
  measure: Measure,
): number {
  const room = width - slack - lead;
  const widths = services.map((service) => measure(serviceNames[service], type.small) + arrow);
  const need = (shown: number) => {
    const links =
      widths.slice(0, shown).reduce((sum, each) => sum + each, 0) +
      Math.max(0, shown - 1) * between;
    if (shown === services.length) return links;
    const more = measure(`+${services.length - shown}`, type.smallStrong) + morePadding;
    return links + (shown > 0 ? between : 0) + more;
  };
  for (let shown = services.length; shown > 0; shown -= 1) if (need(shown) <= room) return shown;
  return 0;
}

let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

/** A text's width on a canvas, kept per text and font until the page's fonts change. */
export function measureText(text: string, font: string): number {
  const key = `${font}\u0000${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  context ??= document.createElement("canvas").getContext("2d");
  // Without a canvas every text counts as too long, so cards take the room they might need.
  if (!context) return Number.POSITIVE_INFINITY;
  context.font = font;
  const width = context.measureText(text).width;
  widths.set(key, width);
  return width;
}

/** The card's type from the type scale's custom properties (DS-13), which a phone sets a step larger. */
function readCardType(): CardType {
  const root = getComputedStyle(document.documentElement);
  const rem = Number.parseFloat(root.fontSize) || 16;
  const px = (name: string, fallback: number) => {
    const value = root.getPropertyValue(name).trim();
    const number = Number.parseFloat(value);
    if (Number.isNaN(number)) return fallback;
    return value.endsWith("rem") ? number * rem : number;
  };
  const family = getComputedStyle(document.body).fontFamily;
  const base = px("--text-base", 13);
  const small = px("--text-small", 12);
  return {
    title: `500 ${base}px ${family}`,
    small: `400 ${small}px ${family}`,
    smallStrong: `500 ${small}px ${family}`,
    titleLine: px("--text-base--line-height", 20),
    smallLine: px("--text-small--line-height", 16),
  };
}

/** The desktop type, where there is no page to read it from, as on the server. */
const desktopType: CardType = {
  title: "500 13px sans-serif",
  small: "400 12px sans-serif",
  smallStrong: "500 12px sans-serif",
  titleLine: 20,
  smallLine: 16,
};

// The type as last read, read again when a phone's type starts or stops applying, or the page's fonts finish loading:
// widths first measured in a fallback font are then measured again in the real one.
let current: CardType | undefined;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;

function changed() {
  widths.clear();
  current = undefined;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const media = globalThis.matchMedia?.(narrowQuery);
    const fonts = globalThis.document?.fonts;
    media?.addEventListener("change", changed);
    fonts?.addEventListener("loadingdone", changed);
    void fonts?.ready.then(() => {
      if (listeners.size > 0) changed();
      return undefined;
    });
    stop = () => {
      media?.removeEventListener("change", changed);
      fonts?.removeEventListener("loadingdone", changed);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop?.();
  };
}

/** The type a card's words are set in, following the screen and the page's fonts. */
export function useCardType(): CardType {
  return useSyncExternalStore(
    subscribe,
    () => (current ??= readCardType()),
    () => desktopType,
  );
}

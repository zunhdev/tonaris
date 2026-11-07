// A cover's main color (DS-46, TON-173), for the album panel's wash: read from the image the proxy serves (TS-103),
// which lets the web app's origin read its pixels (CORS, with `Vary: Origin`). Read apart from the `<img>` the panel
// shows, so that image keeps its own cached copy and shows at once (TON-159). Downscaled to 24 × 24, the colors are
// counted in 512 buckets, weighted toward saturated mid-tones, so a cover's color wins over its black or white
// ground. Kept per image for the page's life; a failure leaves no wash.

export type CoverColor = { hue: number; chroma: number };

const known = new Map<string, CoverColor | null>();
const pending = new Map<string, Promise<CoverColor | null>>();
const side = 24;

/** A cover color already read, null when it can't be, or undefined until read. */
export function knownCoverColor(src: string): CoverColor | null | undefined {
  return known.get(src);
}

/** The cover's main color, read once per image; null when it can't be read. */
export function coverColor(src: string): Promise<CoverColor | null> {
  const done = known.get(src);
  if (done !== undefined) return Promise.resolve(done);
  let reading = pending.get(src);
  if (!reading) {
    reading = read(src).then((color) => {
      known.set(src, color);
      pending.delete(src);
      return color;
    });
    pending.set(src, reading);
  }
  return reading;
}

async function read(src: string): Promise<CoverColor | null> {
  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob(), {
      resizeWidth: side,
      resizeHeight: side,
      resizeQuality: "medium",
    });
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, side, side);
    bitmap.close();
    return dominantColor(context.getImageData(0, 0, side, side).data) ?? null;
  } catch {
    return null;
  }
}

/** The main color of RGBA pixels: the heaviest of 512 color buckets, saturated mid-tones weighing most. */
export function dominantColor(pixels: Uint8ClampedArray): CoverColor | undefined {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    // Nearly transparent pixels show the panel, not the cover.
    if ((pixels[i + 3] ?? 0) < 64) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const lightness = (max + min) / 510;
    const midTone = lightness > 0.12 && lightness < 0.9;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0, n: 0 };
    bucket.weight += 1 + saturation * (midTone ? 3 : 0.6);
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  let heaviest: { weight: number; r: number; g: number; b: number; n: number } | undefined;
  for (const bucket of buckets.values())
    if (!heaviest || bucket.weight > heaviest.weight) heaviest = bucket;
  if (!heaviest) return undefined;
  const { c, h } = oklch(heaviest.r / heaviest.n, heaviest.g / heaviest.n, heaviest.b / heaviest.n);
  return { hue: h, chroma: c };
}

const linear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** sRGB (0–255) to OKLCH, with CSS Color 4's matrices. */
export function oklch(
  red: number,
  green: number,
  blue: number,
): { l: number; c: number; h: number } {
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lab = {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
  const c = Math.hypot(lab.a, lab.b);
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: lab.l, c, h: (h + 360) % 360 };
}

// OKLCH colors and WCAG 2 contrast, for the token contrast test (DS-14). OKLCH → OKLab → linear sRGB uses
// the matrices from CSS Color 4; channels are clipped to the sRGB gamut, as an sRGB display would show them.

export type Oklch = { l: number; c: number; h: number; alpha: number };
type Rgb = [number, number, number];

const oklchPattern = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/;

/** Parses `oklch(L C H)` or `oklch(L C H / A%)`, with L from 0 to 1. */
export function parseOklch(value: string): Oklch {
  const match = oklchPattern.exec(value.trim());
  if (!match) throw new Error(`Not an oklch() color: ${value}`);
  const [, l, c, h, alpha, percent] = match;
  const a = alpha === undefined ? 1 : Number(alpha) / (percent ? 100 : 1);
  return { l: Number(l), c: Number(c), h: Number(h), alpha: a };
}

const clip = (value: number) => Math.min(1, Math.max(0, value));

function toLinearSrgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  return [
    clip(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    clip(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    clip(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  ];
}

const encode = (linear: number) =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
const decode = (encoded: number) =>
  encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;

/** The color as it shows over `background`: alpha is blended in gamma-encoded sRGB, as browsers do. */
function shownOver(color: Oklch, background: Oklch): Rgb {
  const front = toLinearSrgb(color);
  if (color.alpha >= 1) return front;
  const back = toLinearSrgb(background);
  const blend = (i: 0 | 1 | 2) =>
    decode(color.alpha * encode(front[i]) + (1 - color.alpha) * encode(back[i]));
  return [blend(0), blend(1), blend(2)];
}

const luminanceOf = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG 2 relative luminance of an opaque color. */
export function relativeLuminance(color: Oklch): number {
  return luminanceOf(toLinearSrgb(color));
}

/** WCAG 2 contrast ratio of `foreground` shown over the opaque `background`, from 1 to 21. */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const front = luminanceOf(shownOver(foreground, background));
  const back = relativeLuminance(background);
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}

// The album panel's wash (DS-46, TON-173): the top of the panel takes its cover's hue, fading into `bg.panel`. Its
// lightness is fixed and its chroma capped, so text keeps DS-14's 4.5:1 on it for every hue, even a field's
// placeholder in `fg.tertiary` on the field's veil (`tokens.test.ts`). 0.21 is the lightest that allows it.

export const washLightness = 0.21;
export const washMaxChroma = 0.08;

/** The wash's color at the panel's top, for a cover of this OKLCH hue and chroma. */
export function washColor(hue: number, chroma: number): string {
  const c = Math.min(Math.max(chroma, 0), washMaxChroma);
  return `oklch(${washLightness} ${Number(c.toFixed(3))} ${Math.round(((hue % 360) + 360) % 360)})`;
}

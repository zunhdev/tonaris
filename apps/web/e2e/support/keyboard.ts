// Keyboard-only walkthroughs (DS-115, TS-122; TON-93): Tab through a page, or a dialog, and note at each stop what a
// screen reader would announce and whether the focus ring shows.

import { expect, type Locator, type Page } from "@playwright/test";

export type Stop = {
  /** The stop as a screen reader names it: its role, then its name in quotes (an ARIA snapshot's first line). */
  announced: string;
  /** Whether DS-115's ring shows: a solid outline at least 2 px wide. */
  ring: boolean;
};

const focused = (page: Page) => page.locator(":focus");

/** The focused element as `announced` describes it, and whether its ring shows. */
async function stopAt(page: Page): Promise<Stop & { seen: boolean }> {
  const element = focused(page);
  const [announced = ""] = (await element.ariaSnapshot()).split("\n");
  const { ring, seen } = await element.evaluate((node) => {
    const style = getComputedStyle(node);
    // Marks each stop, so a stop met again shows that focus went round instead of leaving the page.
    const before = node.hasAttribute("data-walkthrough");
    node.setAttribute("data-walkthrough", "");
    return {
      ring: style.outlineStyle === "solid" && Number.parseFloat(style.outlineWidth) >= 2,
      seen: before,
    };
  });
  return { announced: announced.replace(/:$/, ""), ring, seen };
}

/**
 * Tabs from the top of the page until focus leaves it, and gives every stop on the way. Fails if focus goes round
 * the page instead (a trap), or there are more than `max` stops.
 */
export async function tabThrough(page: Page, max = 80): Promise<Stop[]> {
  await page.evaluate(() => {
    for (const each of document.querySelectorAll("[data-walkthrough]")) {
      each.removeAttribute("data-walkthrough");
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const stops: Stop[] = [];
  for (let step = 0; step <= max; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each Tab follows the last
    await page.keyboard.press("Tab");
    // oxlint-disable-next-line no-await-in-loop -- the stop it reached
    if ((await focused(page).count()) === 0) return stops;
    // oxlint-disable-next-line no-await-in-loop -- the stop it reached
    const { seen, ...stop } = await stopAt(page);
    if (seen)
      throw new Error(
        `Focus went round the page after ${stops.length} stops, at ${stop.announced}.`,
      );
    stops.push(stop);
  }
  throw new Error(`More than ${max} stops: ${stops.map((stop) => stop.announced).join(", ")}`);
}

/** Whether focus is on something inside `container`, not on the container itself. */
const inside = (container: Locator) =>
  container.evaluate(
    (node) => node !== document.activeElement && node.contains(document.activeElement),
  );

/**
 * Whether focus settles inside `container`. At a modal dialog's edge, Tab touches the page behind for a moment before
 * Base UI brings it back (TON-93's screen-reader passes check what that announces), so this waits for where it ends.
 */
async function settlesInside(container: Locator): Promise<boolean> {
  try {
    await expect.poll(() => inside(container), { timeout: 500, intervals: [50] }).toBe(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tabs through `container` (a dialog or popover) from where it put focus. A modal dialog keeps focus inside, so it
 * ends `round`, back at a stop it met; a popover lets it go on to the page, so it ends `left`.
 */
export async function tabWithin(
  page: Page,
  container: Locator,
  max = 30,
): Promise<{ stops: Stop[]; ends: "round" | "left" }> {
  await page.evaluate(() => {
    for (const each of document.querySelectorAll("[data-walkthrough]")) {
      each.removeAttribute("data-walkthrough");
    }
  });
  const stops: Stop[] = [];
  // Opened with focus on the container itself, its first stop is a Tab away.
  if (await inside(container)) {
    const { seen: _, ...first } = await stopAt(page);
    stops.push(first);
  }
  for (let step = 0; step <= max; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each Tab follows the last
    await page.keyboard.press("Tab");
    // oxlint-disable-next-line no-await-in-loop -- the stop it reached
    if (!(await settlesInside(container))) return { stops, ends: "left" };
    // oxlint-disable-next-line no-await-in-loop -- the stop it reached
    const { seen, ...stop } = await stopAt(page);
    if (seen) return { stops, ends: "round" };
    stops.push(stop);
  }
  throw new Error(`More than ${max} stops inside.`);
}

/** The stops a screen reader would announce without a name, or that show no ring. */
export function faults(stops: readonly Stop[]): string[] {
  return stops.flatMap((stop) => [
    // A name with a colon in it comes quoted: `- 'button "Account: …"'`.
    ...(/^- '?[\w-]+ "[^"]+"/.test(stop.announced) ? [] : [`no name: ${stop.announced}`]),
    ...(stop.ring ? [] : [`no ring: ${stop.announced}`]),
  ]);
}

/** Tabs until `target` has focus, as someone without a mouse would reach it. */
export async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let step = 0; step < max; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each Tab follows the last
    if (await target.evaluate((node) => node === document.activeElement)) return;
    // oxlint-disable-next-line no-await-in-loop -- each Tab follows the last
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab didn't reach the target in ${max} stops.`);
}

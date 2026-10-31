// Pull to refresh's arithmetic (TON-139): how far the spinner follows a finger pulling down, and when letting go
// reloads. Pure, so the rules are tested without a DOM; `PullToRefresh` applies them.

/** How far a pull must take the spinner for letting go to reload, in px. */
export const pullThreshold = 64;

/** How far the spinner follows a finger that moved `dy` px down: half its travel, up to `max`. */
export function pullDistance(dy: number, max = 120): number {
  return dy <= 0 ? 0 : Math.min(max, dy / 2);
}

/** How far along the spinner is, 0 to 1, for its opacity and turn. */
export const pullProgress = (distance: number) => Math.min(1, distance / pullThreshold);

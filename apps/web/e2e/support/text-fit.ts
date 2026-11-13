// Whether a page's text fits (DRIFT-025): long and non-Latin names ran out of their boxes four times before the
// creator caught them by hand (TON-152, TON-156, TON-165, TON-180). `textProblems` reads the page as it is drawn and
// names each place where:
// - the page scrolls sideways;
// - text runs out of a box that doesn't clip it, such as a label past its segment (TON-165) or a control past its
//   dialog's edge (TON-180);
// - text is cut off without an ellipsis, a line clamp or a scroll to reach the rest;
// - text overlaps other text in the same layer, such as a name under its count (TON-156) or a wrapped menu item over
//   the next one (TON-152).

import type { Page } from "@playwright/test";

/** The problems on the page as it is drawn now, each naming the text and where it goes wrong. */
export function textProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Box = { left: number; right: number; top: number; bottom: number };
    const slack = 1;
    const problems: string[] = [];
    const quoted = 40;
    const short = (text: string) => (text.length > quoted ? `${text.slice(0, quoted)}…` : text);
    /** The element, and the nearest named region around it, so a failure says where to look. */
    const name = (element: Element) => {
      const region = element.closest("[aria-label], [aria-labelledby], [role], main, nav, aside");
      const label =
        region?.getAttribute("aria-label") ??
        document.getElementById(region?.getAttribute("aria-labelledby") ?? "")?.textContent ??
        region?.getAttribute("role") ??
        region?.localName;
      return `<${element.localName}>${label ? ` in "${short(label)}"` : ""}`;
    };
    const intersect = (a: Box, b: Box): Box => ({
      left: Math.max(a.left, b.left),
      right: Math.min(a.right, b.right),
      top: Math.max(a.top, b.top),
      bottom: Math.min(a.bottom, b.bottom),
    });
    const area = (box: Box) =>
      Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);

    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth + slack) {
      problems.push(`the page scrolls sideways: ${root.scrollWidth} px in ${window.innerWidth} px`);
    }

    /**
     * What lies over what: popups, dialogs, toasts and sheets are drawn above the page, so text is compared only with
     * text in the same layer. A layer is the nearest popup, else the nearest fixed box, such as a phone's album sheet.
     */
    const popups =
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-slot="toast"], [data-slot="popover-content"]';

    const shown: { element: Element; text: string; box: Box; layer: Element | null }[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      if (!(element instanceof HTMLElement)) continue;
      const own = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (own.length === 0) continue;
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const range = document.createRange();
      let text: Box | undefined;
      for (const node of own) {
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 || rect.height === 0) continue;
          text = text
            ? {
                left: Math.min(text.left, rect.left),
                right: Math.max(text.right, rect.right),
                top: Math.min(text.top, rect.top),
                bottom: Math.max(text.bottom, rect.bottom),
              }
            : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }
      }
      if (!text) continue;
      const words = short(element.textContent?.trim() ?? "");

      let visible: Box = text;
      let checked = false;
      let hidden = false;
      let fixed: Element | null = null;
      for (
        let at: HTMLElement | null = element;
        at && at !== document.body;
        at = at.parentElement
      ) {
        const style = getComputedStyle(at);
        const box = at.getBoundingClientRect();
        // Visually hidden text, for screen readers only.
        if (box.width <= 1 || box.height <= 1) {
          hidden = true;
          break;
        }
        const clips = style.overflowX !== "visible";
        const inline = style.display.startsWith("inline") && style.display !== "inline-block";
        const out = text.right > box.right + slack || text.left < box.left - slack;
        if (!checked && clips) {
          checked = true;
          const scrolls = style.overflowX === "auto" || style.overflowX === "scroll";
          const marked =
            getComputedStyle(element).textOverflow === "ellipsis" ||
            style.textOverflow === "ellipsis" ||
            style.webkitLineClamp !== "none";
          if (out && !scrolls && !marked) {
            problems.push(`"${words}" is cut off without an ellipsis by ${name(at)}`);
          }
        } else if (!checked && !inline && out) {
          checked = true;
          problems.push(`"${words}" runs out of ${name(at)}`);
        }
        if (clips) visible = intersect(visible, box);
        if (!fixed && style.position === "fixed") fixed = at;
      }
      if (hidden || area(visible) <= slack) continue;
      shown.push({ element, text: words, box: visible, layer: element.closest(popups) ?? fixed });
    }

    for (const [index, one] of shown.entries()) {
      for (const other of shown.slice(index + 1)) {
        if (one.layer !== other.layer) continue;
        if (one.element.contains(other.element) || other.element.contains(one.element)) continue;
        if (area(intersect(one.box, other.box)) > 4) {
          problems.push(`"${one.text}" overlaps "${other.text}"`);
        }
      }
    }
    return problems;
  });
}

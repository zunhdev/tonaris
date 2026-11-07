// A page whose own build files fail to load reloads itself, at most once a minute (TON-179). During a deploy the old
// and new web servers both take requests for a moment, so a page from one can ask the other for a script or
// stylesheet it doesn't have, and would stay inert. A reload gets a page and files that match. Later navigation
// inside the app already does this for a route's code (TanStack Router's `lazyRouteComponent`).

const storageKey = "tonaris:build-file-reload";
const minimumGapMs = 60_000;

/**
 * Listens for a build file that fails to load and reloads the page, unless it already did within `gapMs`, so a file
 * that is really gone can't make it loop. It runs serialized, as an inline script in the page's head (`__root.tsx`),
 * so it uses nothing from outside its own body.
 */
export function reloadOnMissingBuildFile(key: string, gapMs: number) {
  addEventListener(
    "error",
    (event) => {
      const element = event.target;
      const url =
        element instanceof HTMLScriptElement
          ? element.src
          : element instanceof HTMLLinkElement
            ? element.href
            : "";
      if (!url.startsWith(`${location.origin}/assets/`)) return;
      try {
        if (Date.now() - Number(sessionStorage.getItem(key)) < gapMs) return;
        sessionStorage.setItem(key, String(Date.now()));
      } catch {
        // Without session storage there's no telling whether the last load was this reload.
        return;
      }
      location.reload();
    },
    // A script's or stylesheet's error doesn't bubble, but the window still sees it while capturing.
    true,
  );
}

/** The inline script for the page's head. */
export const reloadOnMissingBuildFileScript = `(${reloadOnMissingBuildFile.toString()})(${JSON.stringify(storageKey)},${minimumGapMs})`;

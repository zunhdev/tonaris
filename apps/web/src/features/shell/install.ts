// Tonaris as an installed app (section 2.2, DS-94, TON-298). Settings → Preferences says how to install it in the
// browser at hand: Chrome and Edge's own prompt when they offer it, Safari's Add to Dock on a Mac, Add to Home Screen
// on an iPhone or iPad, and short directions elsewhere; and says so when Tonaris already runs as an installed app.
// The manifest's `launch_handler` asks Chrome and Edge to bring an installed app's open window forward for a link,
// rather than open another; that window then goes to the link here, without reloading.
// On an iPhone or iPad, a banner also suggests adding Tonaris to the Home Screen (DS-123, TON-323), until closed.

import { useMediaQuery } from "@/common/media";
import { readText, writeText } from "@/common/storage";
import { useSyncExternalStore } from "react";

/** Chrome and Edge's install offer (`beforeinstallprompt`), which the lib types don't have. */
type InstallPromptEvent = Event & {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Chrome and Edge's launch queue, which hands an open app window the link it was brought forward for. */
type LaunchQueue = { setConsumer(consumer: (params: { targetURL?: string }) => void): void };

/** What Preferences says about installing (DS-94). */
export type InstallAdvice =
  /** Running as an installed app now. */
  | "running"
  /** Just installed from the prompt. */
  | "installed"
  /** Chrome or Edge offers to install: a button opens its prompt. */
  | "prompt"
  /** Safari on a Mac: File → Add to Dock. */
  | "mac-safari"
  /** An iPhone or iPad: Share → Add to Home Screen. */
  | "ios"
  /** Anywhere else, or Chrome once installed: directions for each browser. */
  | "elsewhere";

export type InstallFacts = {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
};

/** What to say about installing, from what the browser tells. */
export function installAdvice(facts: InstallFacts): InstallAdvice {
  if (facts.standalone) return "running";
  if (facts.installed) return "installed";
  if (facts.canPrompt) return "prompt";
  const ua = facts.userAgent;
  // iPadOS's Safari names itself a Mac, but a Mac has no touch screen.
  const touchMac = /Macintosh/.test(ua) && facts.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
  const otherEngine = /Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua);
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !otherEngine) return "mac-safari";
  return "elsewhere";
}

/**
 * Where a launch into this window should go: the link's path, query and fragment when it is this origin's and not
 * where the window already is; otherwise nowhere, as for the launch that opened the window.
 */
export function launchTarget(current: string, target: string | undefined): string | undefined {
  if (target === undefined) return undefined;
  const here = new URL(current);
  let there: URL;
  try {
    there = new URL(target, here);
  } catch {
    return undefined;
  }
  if (there.origin !== here.origin || there.href === here.href) return undefined;
  return `${there.pathname}${there.search}${there.hash}`;
}

const isInstallPrompt = (event: Event): event is InstallPromptEvent =>
  "prompt" in event && typeof event.prompt === "function" && "userChoice" in event;

/** Whether this is an iPhone's Home Screen app: only iOS sets `navigator.standalone`, and only there. */
export function homeScreenApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav: Navigator & { standalone?: boolean } = navigator;
  return nav.standalone === true;
}

let offer: InstallPromptEvent | undefined;
let installed = false;
let watching = false;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

/**
 * In the browser, once: keeps Chrome and Edge's install offer for Preferences, notes an install, and takes the links
 * an installed app's window is brought forward for to `go`. The offer is kept without `preventDefault()`, so the
 * browser's own install hint still shows.
 */
export function watchInstall(go: (href: string) => void): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    if (!isInstallPrompt(event)) return;
    offer = event;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    offer = undefined;
    installed = true;
    changed();
  });
  const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(({ targetURL }) => {
    const href = launchTarget(window.location.href, targetURL);
    if (href !== undefined) go(href);
  });
}

/** Opens the browser's install prompt; the offer is spent either way. */
export async function promptInstall(): Promise<void> {
  const shown = offer;
  if (!shown) return;
  offer = undefined;
  await shown.prompt();
  const { outcome } = await shown.userChoice;
  if (outcome === "accepted") installed = true;
  changed();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** What Preferences says about installing, following the window's display mode and the browser's offer. */
export function useInstallAdvice(): InstallAdvice {
  const standaloneWindow = useMediaQuery("(display-mode: standalone)", false);
  const canPrompt = useSyncExternalStore(
    subscribe,
    () => offer !== undefined,
    () => false,
  );
  const isInstalled = useSyncExternalStore(
    subscribe,
    () => installed,
    () => false,
  );
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return installAdvice({
    standalone: standaloneWindow || homeScreenApp(),
    installed: isInstalled,
    canPrompt,
    userAgent: nav?.userAgent ?? "",
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
  });
}

/**
 * What the Home Screen banner's Install shows (DS-123): the steps, or, in an app's built-in browser, which has no Add to
 * Home Screen, the way to Safari.
 */
export type HomeScreenOffer = "steps" | "safari";

// Apps' built-in browsers that name themselves: Instagram, Facebook, Threads ("Barcelona"), LinkedIn, LINE, Snapchat,
// TikTok, the Google app and WeChat.
const appBrowsers =
  /Instagram|FBAN|FBAV|FB_IAB|Barcelona|LinkedInApp|\bLine\/|Snapchat|musical_ly|BytedanceWebview|TikTok|GSA\/|MicroMessenger/;

/**
 * Whether an iPhone's or iPad's page is in an app's built-in browser. Safari, and Chrome, Firefox and Edge, which can
 * add to the Home Screen too, name Safari in their user agent; a bare web view doesn't. An app that shows pages in
 * Safari's own view can't be told from Safari, so the steps say what to do there. No feature check tells these apart,
 * so this one reads the user agent.
 */
export function inAppBrowser(userAgent: string): boolean {
  return appBrowsers.test(userAgent) || !/Safari\//.test(userAgent);
}

/** What the Home Screen banner offers here, if it shows at all: only on an iPhone or iPad, outside the installed app. */
export function homeScreenOffer(
  facts: Pick<InstallFacts, "standalone" | "userAgent" | "maxTouchPoints">,
): HomeScreenOffer | undefined {
  const advice = installAdvice({ ...facts, installed: false, canPrompt: false });
  if (advice !== "ios") return undefined;
  return inAppBrowser(facts.userAgent) ? "safari" : "steps";
}

/** Where this device keeps that the banner was closed: for good, on the landing page and in the app alike. */
export const bannerClosedKey = "tonaris:install-banner";

const bannerListeners = new Set<() => void>();
// Closed in this page even when storage refuses the write, as in a private window.
let closedHere = false;

const subscribeBanner = (listener: () => void) => {
  bannerListeners.add(listener);
  return () => bannerListeners.delete(listener);
};

/** Closes the banner on this device for good (DS-123); Preferences and Help still say how to install. */
export function closeBanner(): void {
  writeText(bannerClosedKey, "closed");
  closedHere = true;
  for (const listener of bannerListeners) listener();
}

const bannerClosed = () => closedHere || readText(bannerClosedKey) === "closed";

const deviceOffer = (): HomeScreenOffer | "none" =>
  homeScreenOffer({
    standalone: globalThis.matchMedia?.("(display-mode: standalone)").matches || homeScreenApp(),
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  }) ?? "none";

const unchanging = () => () => {};

/**
 * What the Home Screen banner offers, or undefined while it doesn't show: on the server, and until the page is
 * hydrated, so the landing page's server render matches; elsewhere than an iPhone or iPad; and once closed.
 */
export function useHomeScreenOffer(): HomeScreenOffer | undefined {
  const closed = useSyncExternalStore(subscribeBanner, bannerClosed, () => true);
  const here = useSyncExternalStore(unchanging, deviceOffer, () => "none" as const);
  return closed || here === "none" ? undefined : here;
}

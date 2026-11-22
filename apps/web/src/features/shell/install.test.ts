// What Preferences says about installing in each browser, and where a launch into an open app window goes (TON-298);
// and who sees the Home Screen banner, with the steps or the way to Safari (DS-123, TON-323).

import { describe, expect, test } from "bun:test";

import {
  homeScreenOffer,
  inAppBrowser,
  installAdvice,
  launchTarget,
  type InstallFacts,
} from "./install";

const agents = {
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  macEdge:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15",
  macFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/605.1.15",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/142.0.0.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0.0 (iPhone16,2; iOS 18_7; en_GB; en-GB; scale=3.00; 1290x2796; 123456789)",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0.0;FBBV/1;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/5]",
  iphoneThreads:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 400.0.0.0.0 (iPhone16,2; iOS 18_7; en_GB; en-GB; scale=3.00; 1290x2796; 123456789)",
  iphoneGoogleApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/390.0.0 Mobile/15E148 Safari/604.1",
  iphoneWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
};

const facts = (overrides: Partial<InstallFacts>): InstallFacts => ({
  standalone: false,
  installed: false,
  canPrompt: false,
  userAgent: agents.macChrome,
  maxTouchPoints: 0,
  ...overrides,
});

describe("installAdvice", () => {
  test("an installed app's window says it runs installed, whatever else holds", () => {
    expect(installAdvice(facts({ standalone: true, canPrompt: true }))).toBe("running");
    expect(installAdvice(facts({ standalone: true, userAgent: agents.iphoneSafari }))).toBe(
      "running",
    );
  });

  test("an install from the prompt says it's installed", () => {
    expect(installAdvice(facts({ installed: true }))).toBe("installed");
  });

  test("Chrome or Edge's offer gets the button", () => {
    expect(installAdvice(facts({ canPrompt: true }))).toBe("prompt");
    expect(installAdvice(facts({ canPrompt: true, userAgent: agents.macEdge }))).toBe("prompt");
    expect(installAdvice(facts({ canPrompt: true, userAgent: agents.androidChrome }))).toBe(
      "prompt",
    );
  });

  test("Safari on a Mac gets Add to Dock", () => {
    expect(installAdvice(facts({ userAgent: agents.macSafari }))).toBe("mac-safari");
  });

  test("an iPhone or iPad gets Add to Home Screen, in Safari or another browser", () => {
    expect(installAdvice(facts({ userAgent: agents.iphoneSafari }))).toBe("ios");
    expect(installAdvice(facts({ userAgent: agents.iphoneChrome }))).toBe("ios");
    // iPadOS's Safari names itself a Mac.
    expect(installAdvice(facts({ userAgent: agents.macSafari, maxTouchPoints: 5 }))).toBe("ios");
  });

  test("other browsers, and Chrome without an offer, get directions", () => {
    expect(installAdvice(facts({}))).toBe("elsewhere");
    expect(installAdvice(facts({ userAgent: agents.macEdge }))).toBe("elsewhere");
    expect(installAdvice(facts({ userAgent: agents.macFirefox }))).toBe("elsewhere");
    expect(installAdvice(facts({ userAgent: agents.windowsFirefox }))).toBe("elsewhere");
    expect(installAdvice(facts({ userAgent: agents.androidChrome }))).toBe("elsewhere");
  });
});

describe("launchTarget", () => {
  const here = "https://tonaris.app/l/0190a3b2-0000-7000-8000-000000000001?album=a";

  test("a link elsewhere in Tonaris goes there, with its query and fragment", () => {
    expect(launchTarget(here, "https://tonaris.app/unsorted")).toBe("/unsorted");
    expect(launchTarget(here, "https://tonaris.app/sign-in/verify?email=a%40b.c#code=123456")).toBe(
      "/sign-in/verify?email=a%40b.c#code=123456",
    );
  });

  test("the launch that opened the window, or none, goes nowhere", () => {
    expect(launchTarget(here, here)).toBeUndefined();
    expect(launchTarget(here, undefined)).toBeUndefined();
  });

  test("another origin goes nowhere", () => {
    expect(launchTarget(here, "https://open.spotify.com/album/1")).toBeUndefined();
    expect(launchTarget(here, "https://api.tonaris.app/v1/me")).toBeUndefined();
  });
});

const offer = (userAgent: string, more: { standalone?: boolean; maxTouchPoints?: number } = {}) =>
  homeScreenOffer({ standalone: false, maxTouchPoints: 0, userAgent, ...more });

describe("homeScreenOffer", () => {
  test("an iPhone or iPad gets the steps, in Safari or a browser that can add to the Home Screen", () => {
    expect(offer(agents.iphoneSafari)).toBe("steps");
    expect(offer(agents.iphoneChrome)).toBe("steps");
    expect(offer(agents.iphoneFirefox)).toBe("steps");
    expect(offer(agents.iphoneEdge)).toBe("steps");
    // iPadOS's Safari names itself a Mac.
    expect(offer(agents.macSafari, { maxTouchPoints: 5 })).toBe("steps");
  });

  test("an app's built-in browser gets the way to Safari", () => {
    for (const agent of [
      agents.iphoneInstagram,
      agents.iphoneFacebook,
      agents.iphoneThreads,
      agents.iphoneGoogleApp,
      agents.iphoneWebView,
    ])
      expect(offer(agent)).toBe("safari");
  });

  test("no banner in the installed app, on Android or on a computer", () => {
    expect(offer(agents.iphoneSafari, { standalone: true })).toBeUndefined();
    expect(offer(agents.androidChrome)).toBeUndefined();
    expect(offer(agents.macSafari)).toBeUndefined();
    expect(offer(agents.macChrome)).toBeUndefined();
    expect(offer(agents.windowsFirefox)).toBeUndefined();
  });
});

describe("inAppBrowser", () => {
  test("Safari and the browsers built on it are not an app's", () => {
    expect(inAppBrowser(agents.iphoneSafari)).toBe(false);
    expect(inAppBrowser(agents.iphoneChrome)).toBe(false);
    expect(inAppBrowser(agents.iphoneFirefox)).toBe(false);
  });

  test("a named app, or a bare web view, is", () => {
    expect(inAppBrowser(agents.iphoneThreads)).toBe(true);
    expect(inAppBrowser(agents.iphoneWebView)).toBe(true);
  });
});

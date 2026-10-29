// Measures the real app against Q-01's provisional targets (TS-120, TON-92), on the reference workload: quick search
// in the palette on both reference devices, the guest page's largest contentful paint on the mobile reference, and
// the export. Plain timers from the keystroke to the palette's rendered results, the browser's own LCP, and the
// download's duration. Results go to perf/results/verify.json and the console.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type Browser, devices, expect, type Page, test } from "@playwright/test";

import { shareSettingsSchema, uuidv7 } from "@tonaris/domain";

import { signIn } from "../e2e/support/sign-in";
import { verifyApiPort, verifyPort } from "../playwright.verify.config";

const api = `http://localhost:${verifyApiPort}`;
const owner = "workload@tonaris.test";
const mbps = (n: number) => (n * 1_000_000) / 8;

/** TS-120's reference devices, as the TON-21 suite throttles them (perf/q01.perf.ts). */
const profiles = {
  desktop: {
    context: { viewport: { width: 1440, height: 900 } },
    cpuRate: 1,
    network: { latency: 30, downloadThroughput: mbps(50), uploadThroughput: mbps(50) },
  },
  mobile: {
    context: { ...devices["Pixel 7"] },
    cpuRate: 4,
    network: { latency: 165, downloadThroughput: mbps(9) * 0.9, uploadThroughput: mbps(1.5) * 0.9 },
  },
};
type Profile = (typeof profiles)[keyof typeof profiles];

/** Words the workload's titles, artists and names hold. */
const queries = ["lisbon", "velvet", "golden", "silence"];

const percentile = (values: number[], p: number) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
};
const round = (ms: number) => Math.round(ms);

async function throttled(browser: Browser, profile: Profile, storageState?: string) {
  const context = await browser.newContext({ ...profile.context, storageState });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.network });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
  return page;
}

/** Keystroke-to-results times in the palette, typing each query a letter at a time. */
async function quickSearch(page: Page): Promise<number[]> {
  await page.goto("/c");
  // The workload's first root folder: the collection has synced.
  await expect(page.getByRole("link", { name: "Labels by country" })).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    const samples: number[] = [];
    let started = 0;
    document.addEventListener("keydown", (event) => (started = event.timeStamp), true);
    const results = document.querySelector('[role="dialog"]');
    new MutationObserver(() => {
      if (started === 0) return;
      samples.push(performance.now() - started);
      started = 0;
    }).observe(results ?? document.body, { subtree: true, childList: true, characterData: true });
    Object.assign(window, { quickSearch: samples });
  });
  const field = dialog.getByRole("combobox");
  for (const query of queries) {
    // Under the palette's 150 ms pause, so shared content is searched only after each query.
    // oxlint-disable-next-line no-await-in-loop -- one query after another, as a person types
    await field.pressSequentially(query, { delay: 120 });
    // oxlint-disable-next-line no-await-in-loop
    await page.waitForTimeout(400);
    // oxlint-disable-next-line no-await-in-loop
    await field.fill("");
  }
  return page.evaluate(() => {
    const samples: unknown = Reflect.get(window, "quickSearch");
    return Array.isArray(samples) ? samples.map(Number) : [];
  });
}

/** The guest page's LCP on fresh visits, as the browser reports it. */
async function guestLcp(browser: Browser, url: string, visits: number): Promise<number[]> {
  const samples: number[] = [];
  for (let visit = 0; visit < visits; visit += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one visit after another, each cold
    const page = await throttled(browser, profiles.mobile);
    // oxlint-disable-next-line no-await-in-loop
    await page.goto(url, { waitUntil: "load" });
    // oxlint-disable-next-line no-await-in-loop
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const last = list.getEntries().at(-1);
            if (last) resolve(last.startTime);
          }).observe({ type: "largest-contentful-paint", buffered: true });
        }),
    );
    samples.push(lcp);
    // oxlint-disable-next-line no-await-in-loop
    await page.context().close();
  }
  return samples;
}

test("Q-01's provisional targets on the real app", async ({ browser }) => {
  // Signed in once; each profile's context starts from the same session.
  const signedIn = await browser.newPage();
  await signIn(signedIn, owner);
  // Beside the perf suite's sessions, which git ignores: never in perf/results/, which is committed.
  const state = path.join(import.meta.dirname, "..", "playwright", ".perf", "verify-session.json");
  await mkdir(path.dirname(state), { recursive: true });
  await signedIn.context().storageState({ path: state });

  const search: Record<string, number[]> = {};
  for (const [name, profile] of Object.entries(profiles)) {
    // oxlint-disable-next-line no-await-in-loop -- one profile at a time, sharing nothing
    const page = await throttled(browser, profile, state);
    // oxlint-disable-next-line no-await-in-loop
    search[name] = await quickSearch(page);
    // oxlint-disable-next-line no-await-in-loop
    await page.context().close();
  }

  // The guest page of the workload's largest root folder, by the albums its lists hold.
  const request = signedIn.request;
  const send = async (name: string, args: Record<string, unknown>) => {
    const response = await request.post(`${api}/v1/mutations`, {
      headers: { origin: `http://localhost:${verifyPort}` },
      data: { mutationId: uuidv7(), name, args },
    });
    expect((await response.json()).outcome.status).toBe("confirmed");
  };
  const snapshot = await (await request.get(`${api}/v1/sync/bootstrap`)).json();
  type Item = { id: string; kind: string; parentId: string | null };
  const containers: Item[] = snapshot.containers;
  const entries: { listId: string }[] = snapshot.memberships;
  const rootOf = (item: Item): Item => {
    const parent = containers.find((each) => each.id === item.parentId);
    return parent ? rootOf(parent) : item;
  };
  const held = new Map<string, number>();
  for (const entry of entries) {
    const list = containers.find((each) => each.id === entry.listId);
    if (list) held.set(rootOf(list).id, (held.get(rootOf(list).id) ?? 0) + 1);
  }
  const [largest, entriesHeld] = [...held].toSorted((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const linkId = uuidv7();
  await send("share.setLink", { containerId: largest, linkId, enabled: true });
  const settings = shareSettingsSchema.parse(
    await (await request.get(`${api}/v1/containers/${largest}/sharing`)).json(),
  );
  const lcp = await guestLcp(browser, settings.link?.url ?? "", 5);
  await send("share.setLink", { containerId: largest, linkId, enabled: false });

  const exports: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- one download after another
    const response = await request.get(`${api}/v1/export`);
    // oxlint-disable-next-line no-await-in-loop
    await response.body();
    exports.push(performance.now() - started);
  }

  const summary = {
    quickSearch: Object.fromEntries(
      Object.entries(search).map(([name, samples]) => [
        name,
        { keystrokes: samples.length, p95: round(percentile(samples, 95)) },
      ]),
    ),
    guestLcp: { entriesHeld, visits: lcp.length, p75: round(percentile(lcp, 75)) },
    export: { runs: exports.length, max: round(Math.max(...exports)) },
  };
  await mkdir(path.join(import.meta.dirname, "results"), { recursive: true });
  await writeFile(
    path.join(import.meta.dirname, "results", "verify.json"),
    `${JSON.stringify({ summary, search, lcp, exports }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
});

// Measures the sync prototype against the provisional Q-01 targets (TS-120, TON-21), once per reference device,
// with Chrome DevTools' throttling: cold start, opening and sorting lists, an edit's feedback and confirmation,
// propagation to the account's other session, and a viewer's refetch. Results go to perf/results/ and the console.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { type Browser, devices, type Page, test } from "@playwright/test";
import { z } from "zod";

import { perfApiPort, sessionsFile } from "../playwright.perf.config";

type Profile = {
  name: string;
  context: Parameters<Browser["newContext"]>[0];
  /** Chrome's CPU slowdown; 1 is none. */
  cpuRate: number;
  /** Chrome's network throttling: added latency per request, and bandwidth in bytes per second. */
  network: { latency: number; downloadThroughput: number; uploadThroughput: number };
};

const mbps = (n: number) => (n * 1_000_000) / 8;

const profiles: Profile[] = [
  {
    // TS-120's desktop: 50 Mbit/s with a 30 ms RTT. The CPU isn't slowed, though this Mac is faster than an M1.
    name: "desktop",
    context: { viewport: { width: 1440, height: 900 } },
    cpuRate: 1,
    network: { latency: 30, downloadThroughput: mbps(50), uploadThroughput: mbps(50) },
  },
  {
    // TS-120's mobile: DevTools' "Fast 4G" and its 4× mid-tier mobile CPU.
    name: "mobile",
    context: { ...devices["Pixel 7"] },
    cpuRate: 4,
    network: { latency: 165, downloadThroughput: mbps(9) * 0.9, uploadThroughput: mbps(1.5) * 0.9 },
  },
];

const sessionsSchema = z.object({ owner: z.tuple([z.string(), z.string()]), sharer: z.string() });

/** The cookies the perf API signed in with (apps/api/src/perf-server.ts). */
async function sessions() {
  const text = await readFile(path.join(import.meta.dirname, "..", sessionsFile), "utf8");
  return sessionsSchema.parse(JSON.parse(text));
}

/** A signed-in, throttled page of the perf app, after its cold start. */
async function open(browser: Browser, profile: Profile, cookie: string): Promise<Page> {
  const context = await browser.newContext(profile.context);
  const equals = cookie.indexOf("=");
  await context.addCookies([
    {
      name: cookie.slice(0, equals),
      value: cookie.slice(equals + 1),
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.network });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
  await page.goto(`/?api=http://localhost:${perfApiPort}`);
  await waitFor(page, "cold-start", 1);
  return page;
}

const samples = (page: Page, kind: string) =>
  page.evaluate((k) => window.perf.samples.filter((s) => s.kind === k).map((s) => s.ms), kind);

function waitFor(page: Page, kind: string, count: number) {
  return page.waitForFunction(
    ([k, n]) => window.perf?.samples.filter((s) => s.kind === k).length >= n,
    [kind, count] as const,
    { timeout: 30_000 },
  );
}

/** Clicks `selector` and waits for the measurement of `kind` it starts. */
async function measure(page: Page, selector: string, kind: string): Promise<void> {
  const before = (await samples(page, kind)).length;
  await page.click(selector);
  await waitFor(page, kind, before + 1);
}

function p(values: number[], percentile: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)] ?? NaN);
}

const sort = (index: number) => `[data-sort="${index % 2 === 0 ? "year" : "title"}"]`;

for (const profile of profiles) {
  test(`Q-01 on the ${profile.name} reference`, async ({ browser }) => {
    const { owner, sharer } = await sessions();
    const web = await open(browser, profile, owner[0]);
    const results: Record<string, number[]> = {};
    const coldStart: number[] = [];
    results.coldStart = coldStart;

    // Cold start with the assets cached, as TS-120 measures it.
    for (let index = 0; index < 3; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await web.reload();
      // oxlint-disable-next-line no-await-in-loop
      await waitFor(web, "cold-start", 1);
      // oxlint-disable-next-line no-await-in-loop
      coldStart.push(...(await samples(web, "cold-start")));
    }

    // Opening 20 of the 250 lists, and All albums (5,000) after every fifth; then six sorts of each.
    const lists = await web.$$eval("nav [data-list]", (buttons) =>
      buttons.map((b) => b.getAttribute("data-list") ?? "").filter((id) => id !== "all"),
    );
    // Ends on All albums, where the first sorts run.
    for (const [index, id] of lists
      .filter((_, i) => i % 12 === 0)
      .slice(0, 20)
      .entries()) {
      // oxlint-disable-next-line no-await-in-loop
      await measure(web, `[data-list="${id}"]`, "open-list");
      if (index % 5 === 4) {
        // oxlint-disable-next-line no-await-in-loop
        await measure(web, '[data-list="all"]', "open-all");
      }
    }
    for (let index = 0; index < 6; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await measure(web, sort(index), "sort-all");
    }
    await measure(web, `[data-list="${lists[0] ?? ""}"]`, "open-list");
    for (let index = 0; index < 6; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await measure(web, sort(index), "sort-list");
    }
    await measure(web, '[data-list="all"]', "open-all");
    for (const kind of ["open-list", "open-all", "sort-all", "sort-list"]) {
      // oxlint-disable-next-line no-await-in-loop
      results[kind] = await samples(web, kind);
    }

    // 20 edits of the first album's year, watched by a second session of the account.
    const phone = await open(browser, profile, owner[1]);
    const album = await web.getAttribute('[data-testid="edit-year"]', "data-album");
    results.propagation = [];
    for (let index = 0; index < 20; index += 1) {
      const key = `${album}:${1901 + index}`;
      // oxlint-disable-next-line no-await-in-loop
      await web.fill('[data-testid="edit-year"]', String(1901 + index));
      // oxlint-disable-next-line no-await-in-loop
      await web.press('[data-testid="edit-year"]', "Enter");
      // oxlint-disable-next-line no-await-in-loop
      await waitFor(web, "confirmation", index + 1);
      // oxlint-disable-next-line no-await-in-loop
      await phone.waitForFunction((k) => window.perf.shownAt.has(k), key, { timeout: 30_000 });
      // oxlint-disable-next-line no-await-in-loop
      const made = await web.evaluate((k) => window.perf.madeAt.get(k) ?? NaN, key);
      // oxlint-disable-next-line no-await-in-loop
      const shown = await phone.evaluate((k) => window.perf.shownAt.get(k) ?? NaN, key);
      results.propagation.push(shown - made);
    }
    results.feedback = await samples(web, "feedback");
    results.confirmation = await samples(web, "confirmation");

    // A viewer's refetch, approximated by the sharer fetching its own 2,000-album collection.
    const viewer = await open(browser, profile, sharer);
    results.refetch = await viewer.evaluate(() => window.perf.refetch(5));

    const summary = Object.fromEntries(
      Object.entries(results).map(([kind, values]) => [
        kind,
        { n: values.length, p50: p(values, 50), p95: p(values, 95) },
      ]),
    );
    const out = path.join(import.meta.dirname, "results", `${profile.name}.json`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(
      out,
      `${JSON.stringify({ profile: profile.name, summary, results }, null, 2)}\n`,
    );
    console.log(`\n${profile.name}:`);
    console.table(summary);

    await Promise.all([web, phone, viewer].map((page) => page.context().close()));
  });
}

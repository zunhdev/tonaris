// The in-memory stand-in for a browser's tabs (TS-23), which the sync tests rely on: one leader at a time, a lead that
// can be taken (TON-137), messages to the other tabs only, and adoption only from a tab that is gone. The browser tests cover the real one.

import { describe, expect, test } from "bun:test";

import { memoryBrowser, type TabMessage } from "./tabs";

describe("memoryBrowser", () => {
  test("lets one tab lead at a time, and the next lead once it closes", async () => {
    const browser = memoryBrowser();
    const [first, second] = [browser.tab("anna"), browser.tab("anna")];
    const order: string[] = [];
    void first.lead(new AbortController().signal).then(() => order.push("first"));
    void second.lead(new AbortController().signal).then(() => order.push("second"));
    await Bun.sleep(10);
    expect(order).toEqual(["first"]);

    first.close();
    await Bun.sleep(10);
    expect(order).toEqual(["first", "second"]);
    second.close();
  });

  test("a steal takes the lead at once and ends the holder's, which then releases nothing (TON-137)", async () => {
    const browser = memoryBrowser();
    const [asleep, shown, waiting] = [
      browser.tab("anna"),
      browser.tab("anna"),
      browser.tab("anna"),
    ];
    const asleepLead = await asleep.lead(new AbortController().signal);
    const order: string[] = [];
    void waiting.lead(new AbortController().signal).then(() => order.push("waiting"));
    const shownLead = await shown.lead(new AbortController().signal, { steal: true });
    await Bun.sleep(10);
    expect(asleepLead.aborted).toBe(true);
    expect(shownLead.aborted).toBe(false);
    // The tab whose lead was taken releasing nothing, the waiting tab still waits for the new holder.
    asleep.close();
    await Bun.sleep(10);
    expect(order).toEqual([]);
    shown.close();
    await Bun.sleep(10);
    expect(order).toEqual(["waiting"]);
    waiting.close();
  });

  test("sends a message to the account's other tabs, not to the sender or other accounts", async () => {
    const browser = memoryBrowser();
    const [sender, peer, other] = [browser.tab("anna"), browser.tab("anna"), browser.tab("ben")];
    const received = new Map<string, TabMessage[]>([
      ["sender", []],
      ["peer", []],
      ["other", []],
    ]);
    for (const [name, tab] of [
      ["sender", sender],
      ["peer", peer],
      ["other", other],
    ] as const) {
      tab.subscribe((message) => received.get(name)?.push(message));
    }
    sender.post({ type: "reset" });
    await Bun.sleep(10);
    expect(Object.fromEntries(received)).toEqual({
      sender: [],
      peer: [{ type: "reset" }],
      other: [],
    });
  });

  test("adopts from a tab only once it is gone, and one adopter at a time", async () => {
    const browser = memoryBrowser();
    const [gone, first, second] = [browser.tab("anna"), browser.tab("anna"), browser.tab("anna")];
    await Bun.sleep(1);
    expect(await first.adopt(gone.id, () => Promise.resolve())).toBe(false);

    gone.close();
    await Bun.sleep(1);
    const held = Promise.withResolvers<void>();
    const adopting = first.adopt(gone.id, () => held.promise);
    await Bun.sleep(1);
    expect(await second.adopt(gone.id, () => Promise.resolve())).toBe(false);
    held.resolve();
    expect(await adopting).toBe(true);
  });
});

// Telling reconnecting from offline (DS-81, TS-24), with an engine and a browser network the test drives, and a
// short window in place of 15 s.

import { describe, expect, test } from "bun:test";

import { watchConnection, type Network, type PageVisibility } from "./connection";
import type { ConnectionStatus } from "./engine";

function fakeEngine(initial: ConnectionStatus = "connecting") {
  let status = initial;
  const listeners = new Set<(status: ConnectionStatus) => void>();
  return {
    get status() {
      return status;
    },
    onStatus(listener: (next: ConnectionStatus) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    report(next: ConnectionStatus) {
      status = next;
      for (const listener of listeners) listener(next);
    },
  };
}

function fakeNetwork(): Network & { go(online: boolean): void } {
  let onLine = true;
  const listeners = { online: new Set<() => void>(), offline: new Set<() => void>() };
  return {
    get onLine() {
      return onLine;
    },
    addEventListener: (type, listener) => listeners[type].add(listener),
    removeEventListener: (type, listener) => listeners[type].delete(listener),
    go(online) {
      onLine = online;
      for (const listener of listeners[online ? "online" : "offline"]) listener();
    },
  };
}

function fakePage(): PageVisibility & { show(shown: boolean): void; resume(): void } {
  let hidden = false;
  const listeners = { visibilitychange: new Set<() => void>(), resume: new Set<() => void>() };
  return {
    get hidden() {
      return hidden;
    },
    addEventListener: (type, listener) => listeners[type].add(listener),
    removeEventListener: (type, listener) => listeners[type].delete(listener),
    show(shown) {
      hidden = !shown;
      for (const listener of listeners.visibilitychange) listener();
    },
    resume() {
      for (const listener of listeners.resume) listener();
    },
  };
}

const windowMs = 40;

function watch(engine = fakeEngine(), network = fakeNetwork(), page = fakePage()) {
  const watched = watchConnection({ engine, network, page, offlineAfterMs: windowMs });
  const seen: string[] = [watched.state];
  watched.subscribe(() => seen.push(watched.state));
  return { engine, network, page, watched, seen };
}

describe("the connection (DS-81, TS-24)", () => {
  test("connecting until the stream is live, then connected", () => {
    const { engine, seen, watched } = watch();
    engine.report("live");
    expect(seen).toEqual(["connecting", "connected"]);
    watched.stop();
  });

  test("a dropped stream is reconnecting, then offline once the window has passed", async () => {
    const { engine, seen, watched } = watch();
    engine.report("live");
    engine.report("reconnecting");
    expect(watched.state).toBe("reconnecting");
    await Bun.sleep(windowMs * 2);
    expect(seen).toEqual(["connecting", "connected", "reconnecting", "offline"]);

    engine.report("live");
    expect(watched.state).toBe("connected");
    watched.stop();
  });

  test("a stream back within the window never reads as offline", async () => {
    const { engine, seen, watched } = watch();
    engine.report("live");
    engine.report("reconnecting");
    await Bun.sleep(windowMs / 4);
    engine.report("live");
    await Bun.sleep(windowMs * 2);
    expect(seen).toEqual(["connecting", "connected", "reconnecting", "connected"]);
    watched.stop();
  });

  test("the browser losing its network is offline at once, and back online restarts the window", async () => {
    const { engine, network, seen, watched } = watch();
    engine.report("live");
    // Offline before the stream notices it is gone.
    network.go(false);
    expect(watched.state).toBe("offline");
    engine.report("reconnecting");
    expect(watched.state).toBe("offline");

    // Long offline: the window ran out meanwhile, but coming back gives the stream the full window again.
    await Bun.sleep(windowMs * 2);
    network.go(true);
    expect(watched.state).toBe("reconnecting");
    engine.report("live");
    expect(seen).toEqual(["connecting", "connected", "offline", "reconnecting", "connected"]);
    watched.stop();
  });

  test("a stream that outlived the network reads as connected once the network is back", () => {
    const { engine, network, seen, watched } = watch();
    engine.report("live");
    network.go(false);
    network.go(true);
    expect(seen).toEqual(["connecting", "connected", "offline", "connected"]);
    watched.stop();
  });

  test("a page opened without a network starts offline", () => {
    const network = fakeNetwork();
    network.go(false);
    const { watched } = watch(fakeEngine("stopped"), network);
    expect(watched.state).toBe("offline");
    watched.stop();
  });
  test("hidden time doesn't count: a stream dropped before the phone froze the page isn't offline on return (TON-137)", async () => {
    const { engine, page, seen, watched } = watch();
    engine.report("live");
    engine.report("reconnecting");
    page.show(false);
    // Longer than the window, while hidden: as an Android app in the background.
    await Bun.sleep(windowMs * 2);
    expect(watched.state).toBe("reconnecting");

    // Back on screen, the stream gets a full window again before it reads as offline.
    page.show(true);
    await Bun.sleep(windowMs / 2);
    expect(watched.state).toBe("reconnecting");
    engine.report("live");
    expect(seen).toEqual(["connecting", "connected", "reconnecting", "connected"]);
    watched.stop();
  });

  test("an unfrozen page restarts the window too, and a stream that stays down is offline after it", async () => {
    const { engine, page, watched } = watch();
    engine.report("live");
    engine.report("reconnecting");
    await Bun.sleep(windowMs * 0.75);
    page.resume();
    await Bun.sleep(windowMs * 0.75);
    expect(watched.state).toBe("reconnecting");
    await Bun.sleep(windowMs);
    expect(watched.state).toBe("offline");
    watched.stop();
  });
});

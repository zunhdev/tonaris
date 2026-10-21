// Indicative sync timings for the TON-20 spike, on this machine against the local API and Postgres: optimistic
// feedback, server confirmation, settle (confirmation received through the stream) and propagation to a second
// session, per edit; then bootstrap of a large collection into a fresh client. TON-21 measures the Q-01 targets
// on the reference devices and workload; this is a floor for one machine, not that measurement.
//
//   bun apps/web/src/client/sync/bench.ts [--edits 200] [--albums 5000]

import { parseArgs } from "node:util";

import { uuidv7, type Album } from "@tonaris/domain";

import { startApiServer, testClient, until } from "./testing";

const { values } = parseArgs({
  options: {
    edits: { type: "string", default: "200" },
    albums: { type: "string", default: "5000" },
  },
});
const edits = Number(values.edits);
const albums = Number(values.albums);

const percentile = (samples: number[], p: number) => {
  const sorted = samples.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN
  );
};
const summary = (samples: number[]) =>
  `p50 ${percentile(samples, 50).toFixed(1)} ms, p95 ${percentile(samples, 95).toFixed(1)} ms, max ${Math.max(...samples).toFixed(1)} ms`;

const album = (index: number): Album => ({
  id: uuidv7(),
  title: `Album ${index}`,
  artistCredit: `Artist ${index % 400}`,
  releaseType: "album",
  isLive: false,
  originalYear: 1950 + (index % 70),
  recordingYearStart: null,
  recordingYearEnd: null,
});

console.log(`Starting the API… (${edits} edits, then ${albums} albums to bootstrap)`);
const server = await startApiServer(1);
const [webCookie = "", phoneCookie = ""] = server.accounts[0]?.sessions ?? [];
const web = testClient(server, webCookie, { confirmWithinMs: 15_000 });
const phone = testClient(server, phoneCookie, { confirmWithinMs: 15_000 });
await Promise.all([web.albums.preload(), phone.albums.preload()]);

const record = album(0);
await web.albums.insert(record).when("settled");
await until(() => phone.albums.has(record.id));

const feedback: number[] = [];
const confirmation: number[] = [];
const settle: number[] = [];
const propagation: number[] = [];
const sendStarted = new Map<string, number>();
const answered = new Map<string, number>();
// Times the POST round trip by watching the outbox report each mutation's answer.
const send = web.outbox.enqueue.bind(web.outbox);
web.outbox.enqueue = async (mutation) => {
  sendStarted.set(mutation.mutationId, performance.now());
  const outcome = await send(mutation);
  answered.set(mutation.mutationId, performance.now());
  return outcome;
};

for (let index = 0; index < edits; index += 1) {
  const title = `Title ${index}`;
  const startedAt = performance.now();
  const tx = web.albums.update(record.id, (draft) => {
    draft.title = title;
  });
  if (web.albums.get(record.id)?.title === title) feedback.push(performance.now() - startedAt);
  const arrived = new Promise<void>((resolve) => {
    const off = phone.engine.register({
      reset: () => {},
      apply: (change) => {
        if (change.entity !== "album" || change.data?.title !== title) return;
        propagation.push(performance.now() - startedAt);
        off();
        resolve();
      },
    });
  });
  // oxlint-disable-next-line no-await-in-loop
  await tx.when("settled");
  settle.push(performance.now() - startedAt);
  // oxlint-disable-next-line no-await-in-loop
  await arrived;
}
for (const [mutationId, at] of answered) {
  const started = sendStarted.get(mutationId);
  if (started !== undefined) confirmation.push(at - started);
}

console.log(`\nPer edit, ${edits} sequential title edits:`);
console.log(`  optimistic feedback (update → visible):      ${summary(feedback)}`);
console.log(`  server confirmation (POST round trip):       ${summary(confirmation)}`);
console.log(`  settled (confirmation through the stream):   ${summary(settle)}`);
console.log(`  propagation to the other session:            ${summary(propagation)}`);

console.log(`\nAdding ${albums} albums…`);
const addStarted = performance.now();
const batch = 25;
for (let start = 0; start < albums; start += batch) {
  const txs = Array.from({ length: Math.min(batch, albums - start) }, (_, offset) =>
    web.albums.insert(album(start + offset + 1)).when("settled"),
  );
  // oxlint-disable-next-line no-await-in-loop
  await Promise.all(txs);
}
console.log(
  `  ${albums} inserts settled in ${((performance.now() - addStarted) / 1000).toFixed(1)} s`,
);

const bootStarted = performance.now();
const fresh = testClient(server, phoneCookie);
await fresh.albums.preload();
console.log(
  `  fresh client: bootstrap of ${fresh.albums.size} albums ready in ${(performance.now() - bootStarted).toFixed(0)} ms`,
);

await Promise.all([web.stop(), phone.stop(), fresh.stop()]);
await server.stop();

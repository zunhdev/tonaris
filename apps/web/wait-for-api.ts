// The web app's pre-deploy step (TS-01, TS-110): the API deploys before the web app. A host that builds both from
// one commit at the same time, as Render does (render.yaml), would otherwise put new pages in front of an older API.
// So this waits until the API answers `/v1/health` naming this build's commit (`GIT_COMMIT`, or Render's
// `RENDER_GIT_COMMIT`); without one from the host, until the API answers at all. It asks over the private network
// (`API_INTERNAL_URL`) when there is one, otherwise at `API_URL`. After 20 minutes it gives up, which fails this
// deploy and leaves the running version serving.
//
//   bun wait-for-api.ts

const commit = process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || undefined;
const internal = process.env.API_INTERNAL_URL;
// A bare `host:port`, as Render's Blueprint gives it, is plain HTTP (as in src/config.ts).
const base =
  (internal && (/^[a-z][a-z\d+.-]*:\/\//i.test(internal) ? internal : `http://${internal}`)) ||
  process.env.API_URL;
if (!base) throw new Error("Set API_URL (see .env.example).");
const health = new URL("/v1/health", base);

const giveUpAfterMs = 20 * 60_000;
const everyMs = 5_000;
const started = Date.now();

/** The commit the API names, `null` when it answers without one, or undefined when it doesn't answer. */
async function apiCommit(): Promise<string | null | undefined> {
  try {
    const response = await fetch(health, { signal: AbortSignal.timeout(everyMs) });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "commit" in body
      ? String(body.commit)
      : null;
  } catch {
    return undefined;
  }
}

console.log(
  commit
    ? `Waiting for the API at ${health.origin} to run ${commit}.`
    : `Waiting for the API at ${health.origin} to answer.`,
);
let lastSaid = started;
for (;;) {
  // oxlint-disable-next-line no-await-in-loop -- one question at a time, every few seconds
  const running = await apiCommit();
  if (running !== undefined && (commit === undefined || running === commit)) {
    console.log(`The API is up${commit ? ` and runs ${commit}` : ""}. Deploying the web app.`);
    break;
  }
  if (Date.now() - started > giveUpAfterMs) {
    console.error(
      `Gave up after 20 minutes: the API ${running === undefined ? "doesn't answer" : `runs ${running ?? "a build without a commit"}`}. The running web app stays.`,
    );
    process.exit(1);
  }
  if (Date.now() - lastSaid >= 60_000) {
    lastSaid = Date.now();
    console.log(
      `Still waiting, ${Math.round((lastSaid - started) / 60_000)} min in: the API ${running === undefined ? "doesn't answer yet" : `runs ${running ?? "a build without a commit"}`}.`,
    );
  }
  // oxlint-disable-next-line no-await-in-loop -- the pause between questions
  await Bun.sleep(everyMs);
}

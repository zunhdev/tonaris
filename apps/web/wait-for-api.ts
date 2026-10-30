// The web app's pre-deploy step (TS-01, TS-110): the API deploys before the web app. A host that builds both from
// one commit at the same time, as Render does (render.yaml), would otherwise put new pages in front of an older API.
// So this waits until the API answers `/v1/health` naming this build's commit (`GIT_COMMIT`, or Render's
// `RENDER_GIT_COMMIT`); without one from the host, until the API answers at all. It asks over the private network
// (`API_INTERNAL_URL`) when there is one, then at the public `API_URL` when the private address doesn't name the
// commit. After 20 minutes it gives up, which fails this deploy and leaves the running version serving.
//
// Every question opens a new connection (TON-113). On Render, one process kept talking to the API instance that
// was running when it started: it heard the old commit, then nothing once that instance stopped, while the new one
// had been live for minutes. A fresh connection reaches whichever instance the host names now, and the public
// address always reaches the live one.
//
//   bun wait-for-api.ts

const commit = process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || undefined;
const internal = process.env.API_INTERNAL_URL;
// A bare `host:port`, as Render's Blueprint gives it, is plain HTTP (as in src/config.ts).
const internalBase =
  internal && (/^[a-z][a-z\d+.-]*:\/\//i.test(internal) ? internal : `http://${internal}`);
const publicBase = process.env.API_URL;
const healths = [...new Set([internalBase, publicBase].filter((base) => !!base))].map(
  (base) => new URL("/v1/health", base),
);
if (healths.length === 0) throw new Error("Set API_URL (see .env.example).");

const giveUpAfterMs = 20 * 60_000;
const everyMs = 5_000;
const started = Date.now();

/** The commit the API names, `null` when it answers without one, or undefined when it doesn't answer. */
async function apiCommit(health: URL): Promise<string | null | undefined> {
  try {
    const response = await fetch(health, {
      signal: AbortSignal.timeout(everyMs),
      // A new connection every time, never one kept from an earlier question.
      keepalive: false,
      headers: { connection: "close", "cache-control": "no-cache" },
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "commit" in body
      ? String(body.commit)
      : null;
  } catch {
    return undefined;
  }
}

const said = (running: string | null | undefined) =>
  running === undefined ? "doesn't answer yet" : `runs ${running ?? "a build without a commit"}`;

console.log(
  `Waiting for the API at ${healths.map((health) => health.origin).join(", then ")} to ${commit ? `run ${commit}` : "answer"}.`,
);
let lastSaid = started;
for (;;) {
  const heard: string[] = [];
  let ready: URL | undefined;
  for (const health of healths) {
    // oxlint-disable-next-line no-await-in-loop -- the private address first, the public one only if it must
    const running = await apiCommit(health);
    heard.push(`${health.origin} ${said(running)}`);
    if (running !== undefined && (commit === undefined || running === commit)) {
      ready = health;
      break;
    }
  }
  if (ready) {
    console.log(
      `The API at ${ready.origin} is up${commit ? ` and runs ${commit}` : ""}. Deploying the web app.`,
    );
    break;
  }
  if (Date.now() - started > giveUpAfterMs) {
    console.error(`Gave up after 20 minutes: ${heard.join("; ")}. The running web app stays.`);
    process.exit(1);
  }
  if (Date.now() - lastSaid >= 60_000) {
    lastSaid = Date.now();
    console.log(
      `Still waiting, ${Math.round((lastSaid - started) / 60_000)} min in: ${heard.join("; ")}.`,
    );
  }
  // oxlint-disable-next-line no-await-in-loop -- the pause between questions
  await Bun.sleep(everyMs);
}

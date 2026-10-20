// The perf page's entry (TON-21): the web app's sync client against the API URL in `?api=`, measured from the
// moment the page starts.

import { createRoot } from "react-dom/client";

import { bootstrapSchema } from "@tonaris/domain";

import { browserFetch, createSyncClient } from "../src/client/sync/client";
import { App } from "./app";
import { perf } from "./marks";

perf.begin("cold", 0);

const apiUrl = new URLSearchParams(location.search).get("api") ?? "http://localhost:3201";
const client = createSyncClient({ apiUrl, fetch: browserFetch });
client.start();

window.perf = Object.assign(perf, {
  async refetch(count: number): Promise<number[]> {
    const times: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const startedAt = performance.now();
      // oxlint-disable-next-line no-await-in-loop
      const response = await browserFetch(`${apiUrl}/v1/sync/bootstrap`);
      // oxlint-disable-next-line no-await-in-loop
      bootstrapSchema.parse(await response.json());
      times.push(performance.now() - startedAt);
    }
    return times;
  },
});

const root = document.querySelector("#root");
if (root) createRoot(root).render(<App client={client} />);

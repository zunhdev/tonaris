// Starts tonaris-api on the Bun adapter (TS-01, TS-04). `bun dev` runs it on port 3001 (TS-06).

import { createApp } from "./app";

const app = createApp().listen(Number(Bun.env.PORT ?? 3001));

console.log(`tonaris-api listening on ${app.server?.url.href}`);

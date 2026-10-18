// Starts tonaris-api on the Bun adapter (TS-01, TS-04). `bun dev` runs it on port 3001 (TS-06).

import { createDatabase } from "@tonaris/db";

import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { apiConfig } from "./config";
import { smtpEmail } from "./email/smtp";

const config = apiConfig();
const auth = createAuth({ config, db: createDatabase(), email: smtpEmail(config) });
const app = createApp({ config, auth }).listen(config.port);

console.log(`tonaris-api listening on ${app.server?.url.href}`);

// Sends one email through Mailpit's SMTP port, to check that local email capture works (TS-06).
// Start the local services with `docker compose up -d`, run `bun run mail:test`, then open the inbox.
// curl speaks SMTP, so the check needs no mail library.

import { $ } from "bun";

const smtpUrl = "smtp://localhost:1025";
const inboxUrl = "http://localhost:8025";
const from = "dev@tonaris.test";
const to = "creator@tonaris.test";

const sentAt = new Date();
const subject = `Tonaris test mail ${sentAt.toISOString()}`;
const message = [
  `From: Tonaris <${from}>`,
  `To: <${to}>`,
  `Subject: ${subject}`,
  `Date: ${sentAt.toUTCString()}`,
  `Message-ID: <${crypto.randomUUID()}@tonaris.test>`,
  "Content-Type: text/plain; charset=utf-8",
  "",
  "If you can read this in Mailpit, local email capture works.",
  "",
].join("\r\n");

try {
  await $`curl --silent --show-error --url ${smtpUrl} --mail-from ${from} --mail-rcpt ${to} --upload-file - < ${new Response(message)}`.quiet();
} catch (error) {
  if (!(error instanceof $.ShellError)) throw error;
  console.error(`Could not send through ${smtpUrl}: ${error.stderr.toString().trim()}`);
  console.error("Is Mailpit running? Start the local services with `docker compose up -d`.");
  process.exit(1);
}

console.log(`Sent "${subject}" to ${to}. Open ${inboxUrl} to see it.`);

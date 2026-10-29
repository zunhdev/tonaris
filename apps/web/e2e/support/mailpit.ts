// Reads the e2e API's email from Mailpit's API (TS-06): http://localhost:8025, which `bun run test:e2e` needs.

import { expect } from "@playwright/test";

const mailpit = "http://localhost:8025/api/v1";

type Summary = { ID: string; To: { Address: string }[] };

const search = (address: string) => `query=${encodeURIComponent(`to:"${address}"`)}`;

function isSummary(value: unknown): value is Summary {
  return typeof value === "object" && value !== null && "ID" in value && "To" in value;
}

/** Deletes every message to `address`, so the next one is the only one. */
export async function clearInbox(address: string): Promise<void> {
  const response = await fetch(`${mailpit}/search?${search(address)}`, { method: "DELETE" });
  expect(response.ok, "Mailpit must be running: brew services start mailpit").toBe(true);
}

/** The messages to exactly `address`, newest first. */
async function messages(address: string): Promise<Summary[]> {
  const response = await fetch(`${mailpit}/search?${search(address)}`);
  const body: unknown = await response.json();
  const found =
    typeof body === "object" && body !== null && "messages" in body ? body.messages : [];
  return (Array.isArray(found) ? found : [])
    .filter(isSummary)
    .filter((message) => message.To.some((to) => to.Address === address));
}

/** Waits until `address` has `count` messages and returns the newest one's subject and text. */
export async function latestEmail(
  address: string,
  count = 1,
): Promise<{ subject: string; text: string }> {
  await expect.poll(async () => (await messages(address)).length, { timeout: 10_000 }).toBe(count);
  const [newest] = await messages(address);
  const response = await fetch(`${mailpit}/message/${newest?.ID}`);
  const message: unknown = await response.json();
  if (typeof message !== "object" || message === null) throw new Error("Mailpit sent no message");
  const subject = "Subject" in message ? String(message.Subject) : "";
  const text = "Text" in message ? String(message.Text) : "";
  return { subject, text };
}

/** The sign-in code and link in the newest of `count` emails to `address`. */
export async function signInEmail(address: string, count = 1) {
  const { text } = await latestEmail(address, count);
  const code = /^(\d{6})\r?$/m.exec(text)?.[1];
  const link = /^(http\S+\/sign-in\/verify\S+)\r?$/m.exec(text)?.[1];
  if (!code || !link) throw new Error(`No sign-in code in the email to ${address}:\n${text}`);
  return { code, link };
}

/** The invitation link in the newest of `count` emails to `address` (DS-91). */
export async function invitationEmail(address: string, count = 1) {
  const { text } = await latestEmail(address, count);
  const link = /^(http\S+\/join\/[^\s#]+)\r?$/m.exec(text)?.[1];
  if (!link) throw new Error(`No invitation link in the email to ${address}:\n${text}`);
  return { link };
}

/** The join code and its link in the newest of `count` emails to `address` (DS-91). */
export async function joinEmail(address: string, count: number) {
  const { text } = await latestEmail(address, count);
  const code = /^(\d{6})\r?$/m.exec(text)?.[1];
  const link = /^(http\S+\/join\/\S+#code=\d+)\r?$/m.exec(text)?.[1];
  if (!code || !link) throw new Error(`No join code in the email to ${address}:\n${text}`);
  return { code, link };
}

/** The code in the newest of `count` emails to `address`, for emails that carry only a code (DS-93). */
export async function emailedCode(address: string, count: number): Promise<string> {
  const { text } = await latestEmail(address, count);
  const code = /^(\d{6})\r?$/m.exec(text)?.[1];
  if (!code) throw new Error(`No code in the email to ${address}:\n${text}`);
  return code;
}

/** The confirmation link, with its code, in the newest email to `address` (TS-73). */
export async function recoveryEmail(address: string): Promise<{ link: string }> {
  const { text } = await latestEmail(address);
  const link = /^(http\S+\/recover\/\S+#code=\d+)\r?$/m.exec(text)?.[1];
  if (!link) throw new Error(`No recovery link in the email to ${address}:\n${text}`);
  return { link };
}

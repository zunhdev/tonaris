// The account deletion this tab follows (TS-74): its token, kept for the tab only, since the session ends when
// deletion starts and `/account-deleted` asks for progress with it. Only that page reads it.

import { forget, readText, storageOf, writeText } from "@/features/shell/storage";

const key = "tonaris.account-deletion";

/** Without storage, the page says the account is deleted without following the job. */
export function rememberDeletion(token: string, store = storageOf(true)): void {
  writeText(key, token, store);
}

export function pendingDeletion(store = storageOf(true)): string | undefined {
  return readText(key, store);
}

export function forgetDeletion(store = storageOf(true)): void {
  forget(key, store);
}

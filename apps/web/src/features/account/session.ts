// The signed-in account (GET /v1/me), loaded once per page and shared by the workspace routes. Only a loaded
// account is kept: a signed-out answer or a failure is asked again next time.

import { api } from "@/api";
import { forgetExport } from "@/features/export/export-state";

import type { Account } from "@tonaris/domain";

let current: Promise<Account | undefined> | undefined;

async function load(): Promise<Account | undefined> {
  const { data, status } = await api.v1.me.get();
  if (data) return data;
  current = undefined;
  if (status === 401) return undefined;
  throw new Error(`Couldn't load the signed-in account (HTTP ${status}).`);
}

/** The signed-in account, or undefined when signed out. Throws when the API can't be reached. */
export function currentAccount(): Promise<Account | undefined> {
  current ??= load().catch((error: unknown) => {
    current = undefined;
    throw error;
  });
  return current;
}

/** Drops the loaded account, after signing in or out, and with it the account's export (TON-89). */
export function forgetAccount(): void {
  current = undefined;
  forgetExport();
}

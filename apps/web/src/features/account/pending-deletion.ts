// The account deletion this tab follows (TS-74): its token, kept for the tab only, since the session ends when
// deletion starts and `/account-deleted` asks for progress with it. Only that page reads it.

const key = "tonaris.account-deletion";

function storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function rememberDeletion(token: string, store = storage()): void {
  try {
    store?.setItem(key, token);
  } catch {
    // Without storage, the page says the account is deleted without following the job.
  }
}

export function pendingDeletion(store = storage()): string | undefined {
  try {
    return store?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function forgetDeletion(store = storage()): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

// The accounts the e2e API creates (apps/api/src/e2e-server.ts): the creator first, then one per sign-in test,
// so tests can run in parallel without sharing an inbox or a session. Mailpit searches by substring, so no
// address may end with another (`link@…` would also find `used-link@…`).

export const apiUrl = "http://localhost:3101";

const at = (name: string) => `${name}@e2e.tonaris.test`;

export const accounts = {
  creator: at("creator"),
  code: at("typed"),
  session: at("session"),
  link: at("link"),
  device: at("device"),
  usedLink: at("spent"),
  wrongCode: at("wrong"),
  resend: at("resend"),
  signOut: at("sign-out"),
  unsafe: at("unsafe"),
  mcp: at("mcp-client"),
  mcpCancel: at("mcp-cancel"),
  mcpDefault: at("mcp-default"),
  approver: at("approver"),
  stranger: at("stranger"),
  // The sync client in the browser (sync-client.e2e.ts), one per test.
  syncReload: at("sync-reload"),
  syncQueued: at("sync-queued"),
  syncOffline: at("sync-offline"),
  syncTabs: at("sync-tabs"),
  syncHandover: at("sync-handover"),
  syncSignOut: at("sync-leave"),
  // The save-state interface (save-states.e2e.ts), one per test.
  saveSlow: at("save-slow"),
  saveUnanswered: at("save-unanswered"),
  saveFailed: at("save-failed"),
  saveConflict: at("save-conflict"),
  saveOffline: at("save-offline"),
  // Batch reports (batch-report.e2e.ts), one per test.
  batchPartial: at("batch-partial"),
  batchRetryAll: at("batch-retry-all"),
} as const;

/** An address with no account. */
export const nobody = at("nobody");

/** Where the setup project saves the creator's signed-in browser state. */
export const creatorState = "playwright/.auth/creator.json";

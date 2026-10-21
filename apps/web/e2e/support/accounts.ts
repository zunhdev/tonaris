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
} as const;

/** An address with no account. */
export const nobody = at("nobody");

/** Where the setup project saves the creator's signed-in browser state. */
export const creatorState = "playwright/.auth/creator.json";

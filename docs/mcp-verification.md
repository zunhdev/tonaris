# Tonaris — MCP client verification (TS-123)

The script each required client runs before M9 counts as done (TON-85, AC-36, AC-37): Claude web, ChatGPT web and Codex, connected from the in-app instructions (Settings → Connections, TON-86). The G3 spikes ran its first version ([TON-22](spikes/2026-10-21-g3-mcp-oauth.md), [TON-23](spikes/2026-10-21-g3-approvals.md)). This version adds what M9 built:
- the full tool set;
- folder deletion and recovery;
- a chosen option's removal;
- the app's waiting list and badge.

## Running it

The clients reach the API over the internet, so both services run behind one cloudflared quick tunnel. One origin keeps a host-only session cookie that both see; production keeps two hosts (TS-08).

1. `bun run db:migrate`, `bun run seed:workload` (once), and `bun run build`.
2. `bun tooling/src/mcp-verification/fixtures.ts`. It prints the fixtures' IDs and the prompts. Run it again between clients: it resets everything.
3. `cloudflared tunnel --url http://localhost:8787`. It prints `https://<name>.trycloudflare.com`, which is `$T` below.
4. `bun tooling/src/spikes/g3-mcp/tunnel-proxy.ts`, which logs every MCP call with its tool.
5. In `apps/api`: `API_ORIGIN=$T WEB_ORIGIN=$T CLIENT_IP_HEADER=cf-connecting-ip bun dist/bin/server.js`.
6. In `apps/web`: `API_URL=$T bun run start`.
7. Sign in at `$T` as `workload@tonaris.test`; codes go to Mailpit (http://localhost:8025). Open Settings → Connections and follow the client's steps there, with `$T/mcp` as the server URL.

## The script

One prompt at a time, as `fixtures.ts` prints them:

| # | Step | Expected |
| --- | --- | --- |
| 1 | Connect **Read-only**; show the list "Verify", and search for "Verify" | The three albums, the injection title named as data and not obeyed |
| 2 | Read-only: create a list | No write tool; nothing changes |
| 3 | Revoke, reconnect as **Manage collection**; add an album and a made-up ID to "Verify other" | One added, one not found |
| 4 | Delete "Verify Album Two"; approve at the link; tell the client | `needs_approval`, then in Trash; Settings and the sidebar showed it waiting |
| 5 | Delete "Verify Album One"; approve; add it to "Verify other" first; finish | A new approval naming two lists; nothing deleted under the first |
| 6 | Delete the folder "Verify folder"; approve; recover it | Approval names the inner list; the folder back with it |
| 7 | Remove the option "Vinyl" | Approval: cleared from 1 album, can't be undone |
| 8 | Empty Trash permanently; share "Verify" | Refused: no tool; it stays in the app |
| 9 | Revoke in Settings; show the overview | The client is refused and asks to reconnect |

## Results

To be filled in by the live run: one row per client, each step Passed, Failed (with what happened) or Not run.

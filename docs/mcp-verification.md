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

**29 October 2026, a short run: steps 1, 2, 6 and 9 in each client.** The creator chose it, because the G3 spikes already ran steps 3–5 in these clients ([TON-23](spikes/2026-10-21-g3-approvals.md)). Steps 7 and 8 are server rules that the contract tests cover. The run checked what the spikes couldn't:
- M9's 36 tools as each client takes them;
- Read-only, live;
- the steps in Settings → Connections;
- a folder's deletion and recovery.

The clients were Claude web and ChatGPT Plus in Firefox, and the Codex CLI 0.162.1, driven with `codex exec`.

| # | Claude web | ChatGPT web (Plus) | Codex CLI |
| --- | --- | --- | --- |
| 1 | Passed | Passed | Passed: the injection listed as an album title, nothing done |
| 2 | Passed: no tool called | Passed | Passed: "the Tonaris connection is read-only" |
| 3–5 | Not run | Not run | Not run |
| 6 | Passed | Passed, after a Refresh (finding 1) | Passed: the approval named "its one list"; recovered "with its list intact" |
| 7–8 | Not run | Not run | Not run |
| 9 | Passed: asked to reconnect | Passed | Passed: "no Tonaris connector is available"; see finding 2 |

Tonaris refused every revoked connection the same way: the next call got `401`, and the refresh token got `400`.

**Findings:**
1. **ChatGPT keeps the tool list it fetched first.** Reconnected as Manage collection, it still had only the 10 read tools, and said so. It fetched the full list only after **Refresh** on the plugin's page, so Settings → Connections now says to refresh after reconnecting in another mode (DS-86). Claude fetches the list again after a reconnect, and Codex fetches it each session.
2. **Codex also sees ChatGPT's plugins,** as `codex_apps` tools next to its own servers.
   - Once the `tonaris` server was revoked, Codex tried the ChatGPT plugin instead. Its approval policy `never` blocked that call, and the reply said to "enable approval".
   - With `--disable apps`, it said no Tonaris connector was available.
   - Either way, Tonaris refused the connection.
3. **Codex asked `search` for 100 results.** The schema's limit is 50, so the call failed validation, and Codex retried with 50.
4. **Protocols:** Claude and ChatGPT spoke 2026-07-28. Codex used `initialize` at 2025-06-18, through the stateless fallback.
5. **The tunnel proxy hid the collection,** but the app was fine.
   - Bun's `fetch` asked the API for gzip, decompressed the reply, and passed its `Content-Encoding` on. The browser couldn't read the 4 MB sync bootstrap, and the sidebar stayed empty.
   - The proxy now asks for no compression, and leaves the sync stream without its 30 s timeout.

**Codex, for a rerun:**
- `codex mcp add tonaris --url $T/mcp` signs in.
- `codex exec` runs non-read-only tools only when they're allowed, one flag per tool: `-c 'mcp_servers.tonaris.tools.delete_items.approval_mode="approve"'`, and likewise `recover_from_trash`.
- `codex exec resume --last "I approved it."` continues after the approval.
- `codex mcp remove tonaris` clears the global config afterwards.

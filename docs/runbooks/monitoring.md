# Tonaris — monitoring

What watches the hosted service (TS-115, Q-06), and how to check it works. The services and accounts are the
creator's to pick; any uptime monitor and any Sentry plan with error reports will do.

## Error reports: Sentry

1. Create a Sentry organization in its **EU** data region (TS-115).
2. Create two projects:
   - **tonaris-api**, platform Bun;
   - **tonaris-web**, platform Browser JavaScript.
3. Set each project's DSN as `SENTRY_DSN` on its own service: the API's on the API, the web app's on the web app. The web app sends its DSN to browsers in a `<meta>`, and adds its host to the CSP's `connect-src`.
4. **Check it:** in Tonaris, go to **Admin → Operations** and choose **Send a test error**.
   - Two events arrive, "Tonaris test error …" from the API and "Tonaris web test error …" from the browser.
   - Each must show `[email]` where `anna@example.com` was. The API's must show `Bearer [redacted]` too.
   - Neither may carry a user, cookies, headers or a request body.

What's sent: errors, and 5% of the API's requests as traces. Before anything leaves, `redact` (`packages/domain/src/telemetry.ts`) replaces tokens, secrets, cookies, codes and email addresses, and the tokens in share, join and recovery links. Request bodies, where titles and descriptions travel, are never sent.

## Logs

The API writes one JSON line per event to stdout and errors to stderr, redacted the same way. The host keeps them.

## Uptime checks

In the uptime monitor, every 5 minutes, alerting by email:

| Check | URL | Passes when |
| --- | --- | --- |
| API | `https://api.<domain>/healthz` | 200 |
| Web app | `https://<domain>/healthz` | 200, `ok` |
| Guest page | `https://<domain>/s/<token>` | 200, and the page names the list |

**The guest page** is a real share link: make a list called "Status check" in your own account, turn on its link, and monitor that URL. Rendering it exercises the web server, the API and the database together (TS-115).

**Check it:** stop the API (or block the monitor's IP) for longer than one interval; the API and guest-page alerts must arrive, then clear when it is back.

## The admin view

**Admin → Operations** shows:
- where the backups are: Render's, on the database's **Recovery** page (TS-112, `restore.md`);
- the jobs that gave up after their retries, with their errors, redacted.

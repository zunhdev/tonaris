# Tonaris — spike: a public feedback board, 1 November 2026

Spike for [TON-132](https://linear.app/zunhdev/issue/TON-132). In manual testing on 31 October 2026, the creator asked for a way for users to send feedback and feature requests from inside Tonaris, and for a friendly public place where requests can be seen, discussed and voted on. This spike compares the ready-made trackers, GitHub, Linear's own intake, and building it into Tonaris.

The vendors' plans and prices were read on their own pages on 31 October 2026. Fider's plan limits were also read in its source (commit `9949e70`, 26 October 2026). Nothing was signed up for.

## Verdict

**Fider Cloud's free plan, at `feedback.tonaris.app`, with "Sign in with Tonaris". The account menu links to it, and nothing of Fider's runs inside Tonaris.**

- **Free, with what Tonaris needs:** a public board with votes, comments and statuses, Tonaris's own address, a custom sign-in provider, an API and webhooks. Only moderation, the roadmap page, search-engine indexing and more than 250 posts need Pro, at $25 a month.
- **No new account:** Fider signs people in through Tonaris's own OAuth server, which Tonaris already runs for MCP. With Fider's email sign-in turned off, only Tonaris's members can post or vote, and anyone can read.
- **Spam is unlikely,** because posting is limited to Tonaris's members, who join by invitation or admission. So the Pro moderation queue can wait.
- **The CSP stays as it is:** a link opens the board in a new tab. Fider has no widget, and refuses to be framed.
- **Private by default:** its privacy policy says "no tracking, no analytics", and its own board sets one session cookie. Its hosting region isn't published (below).
- **The runner-up is Sleekplan:** more polished, with a changelog, a roadmap and a two-way Linear sync, hosted in Ireland. But sign-in from Tonaris costs $13–15 a month at a `sleekplan.app` address, and $38–45 a month at Tonaris's own.

## Decisions (1 November 2026)

The creator decided, after the comparison:

1. **Fider Cloud, on its free plan,** at `feedback.tonaris.app`, with "Sign in with Tonaris" as its only sign-in. Pro waits until moderation, the roadmap page or more than 250 posts are needed.
2. **The board receives each person's name and email,** so Fider can tell them about replies and status changes. The email is never shown on the board.
3. **Requests reach Linear by hand:** a request the creator decides to build becomes a Linear issue that links to its post, and the post is marked Planned. No webhook.

The follow-up feature, [TON-144](https://linear.app/zunhdev/issue/TON-144), builds it.

## Hosted boards

Prices are per month, billed yearly or monthly. "Sign-in from Tonaris" means a person signed in to Tonaris arrives on the board signed in, from a plain link.

| Board | Free plan | Sign-in from Tonaris | At `feedback.tonaris.app` | Data | Linear |
| --- | --- | --- | --- | --- | --- |
| **Fider Cloud** | everything below, 250 posts | free (Tonaris as OAuth provider) | free | region not published; no analytics | none built in; webhooks |
| Fider, self-hosted | all features, open source (AGPL) | free | free | wherever Tonaris hosts it | as Cloud |
| Sleekplan | no sign-in, moderation or own address | Starter, $13 / $15 | Business, $38 / $45 | Ireland | two-way |
| Nolt | none (trial) | Essential, $29 / $39 | Essential | region not stated | Pro, $69 / $89 |
| Canny | 25 people who post, vote or comment | free | Pro, $79 / $99 | US only | Pro |
| Featurebase | 1 board, no own address | Professional, $59 / $75 per seat | Growth and up | Netherlands, Germany | Growth and up |
| Frill | none (trial) | $25, but only through its script inside Tonaris | $25 | US | one-way |
| UserJot | no sign-in or own address | Professional, $49 / $59 | Starter and up | US | listed, undocumented |
| Upvoty | none (trial) | $15, claimed | $15 | EU | contradictory |

- **Fider** is active: nine releases in 2026, the latest on 5 October. Several fixed serious security problems, which Cloud applies itself. A self-hosted board would need its version pinned and bumped, since its Docker `stable` tag lags behind.
- **Self-hosting Fider** needs a container (`getfider/fider`), Postgres 12 or newer, and an email service, which Resend's SMTP would do. It has every feature, but it's one more public service to keep up to date.
- **Sleekplan** signs people in with a JWT that Tonaris would sign and send back from a redirect: the smallest change to Tonaris of any option.
- **Nolt** looked good on paper, but its site is behind a bot check, so its facts come from search results only.
- **Canny's** free plan stops at 25 people, and its prices changed several times in 2026.
- **Featurebase** has turned into a support suite.
- **Frill's** sign-in needs its script in Tonaris, which the CSP refuses.
- **Upvoty's** documentation was unreachable, its plans changed three times in 2026, and buyers complain of price rises.

## Other routes

- **GitHub Discussions** on the public repository: free and public, with upvotes and "Sort by Top". But everyone who posts or votes needs a GitHub account, which is a lot to ask of music fans. It has no approval queue. Reporting posts needs a repository owned by an organization, and `zunhdev/tonaris` belongs to a person.
- **Linear alone:** it has no public board, votes or portal. Outside requesters get private email threads at most, through Linear Asks on the Business plan. Linear's API could take requests from an in-app form, counting requesters per issue as a private demand signal.
- **Built into Tonaris:** an ideas page with votes, comments, statuses and a public read-only view. No vendor and nothing new in the privacy notice, but it is by far the largest build, moderation included.
- **An in-app form only,** which emails the creator through Resend or creates a Linear issue: the smallest build, but nothing public.

## What fits Tonaris

- **The CSP (TS-101):** every vendor's in-app widget loads its own script and iframe, which TS-101's policy refuses. A link to the hosted board needs no change, so every option above works as a link, except Frill's sign-in.
- **Sign-in:** most vendors take a JWT that Tonaris signs with a shared secret, from a redirect: Sleekplan, Nolt, Canny, Featurebase's Professional plan and UserJot's Professional plan. Fider takes an OAuth provider instead. For it, Tonaris's authorization server needs:
  - a first-party client for the board, without PKCE, which Fider doesn't send, and without the consent page. Better Auth allows both for a single client;
  - Better Auth's userinfo endpoint, which Tonaris doesn't serve yet;
  - access tokens for that client that `/mcp` refuses, so the board can never read anyone's collection.
- **What the board learns:** Fider needs only an ID. A name shows on posts, and with no name it shows "Anonymous". An email lets Fider tell people when their request changes status or gets a reply. Tonaris's privacy notice gains a line naming the board's service and what it receives. The terms should say that posts on the board are public.
- **Fider Cloud's hosting region and data processing agreement aren't published.** The privacy notice says where each service keeps data, so the creator would ask Fider before launch. Self-hosting removes the question.
- **Linear:** Fider's webhooks (new post, comment, status change, deleted) could create Linear issues. But on Linear's free plan every issue counts towards its 250, and most requests won't be planned. Planning a request by hand, as a Linear issue that links to the post, keeps Linear for work. Marking the post Planned, Started or Completed keeps the board current.
- **Changelog:** Fider has none. Its Completed filter lists what was done. A "What's new" page can come later, on its own.

## Not verified

- No board was created, and "Sign in with Tonaris" wasn't tried end to end. The follow-up feature proves it with Fider's Test button and a real sign-in.
- Fider Cloud's hosting region and data processing agreement: not published.
- Nolt's facts, which come from search results.

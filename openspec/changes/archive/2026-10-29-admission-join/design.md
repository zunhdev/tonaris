# Design

## Context

- **The API's join flow** (TON-24):
  - `POST /auth/admission/code {token}` sends a sign-in code to the invitation's address and answers `{ email }`;
  - `POST /auth/admission/join {token, otp}` creates the account and sets the session cookie;
  - refusals are problems with the DS-91 sentence in `detail`: 404 invalid, 410 expired, 403 revoked, used or paused;
  - code errors are Better Auth's, as on sign-in.
- **The code email** links to `/join/:token#code=…` (`joinLink`). The invitation email links to `/join/:token` (`invitationLink`, TON-74).
- **Sign-in's verify page** (DS-90) has the code field, the 30-second resend countdown, and the link handling. The link submits at once when `pendingSignIn(email)` says this browser asked, and asks first otherwise.
- **`auth-client.ts`** posts to `/auth/*` and maps outcomes to DS-90's messages. It drops response bodies and knows no `detail`.
- **The root's empty state** already says DS-105's sentence and offers New list.

## Goals / Non-Goals

**Goals:** the landing and its steps, the lookup endpoint, the first-run secondary action, no `Referer` from join URLs, and AC-01's checks.

**Non-Goals:**
- Settings → Profile, where the name is changed later (TON-76);
- any change to how the API admits (TS-71 stays as built).

## Decisions

### 1. Look up before sending

`POST /auth/admission/invitation {token}` answers `{ email }` for a usable invitation, or the same refusal problems as `/code`. It sends nothing and creates no code, so the landing can show the address first, as DS-91 orders.

- **POST, not GET,** so the token stays out of URLs that the API might log.
- **No sign-in limit:** tokens are 32 random bytes, and nothing is sent.

**Alternative considered:** `/code` alone, which shows the address only after sending. That skips DS-91's first step.

### 2. A client-rendered route

`/join/$token` is `ssr: false`. Its loader runs the lookup from the browser, which carries the web origin the API's CSRF rule needs. The link-handling step needs `localStorage` anyway.

The server sends the document with `Referrer-Policy: no-referrer` for `/join/…`, as it does for `/s/…`, since both URLs carry a token.

### 3. Steps

`invited → code → (confirm | joining) → name → /c`, with `refused` and `link-spent` beside them:

| Step | Shows |
| --- | --- |
| invited | "You're invited to Tonaris", "This invitation is for {email}.", **Continue** |
| code | "Check {email}", the shared code field, "Or open the link in the email to join on that device.", **Join**, resend after 30 s |
| confirm | "Join on this device?", "This link creates your Tonaris account for {email}.", **Join** and **Cancel** |
| joining | "Creating your account…" |
| link-spent | "This link has expired or was already used", **Send a new code** |
| name | "Add a display name", "People you share with see this name instead of your email. You can add this later.", **Save** and **Skip for now** |
| refused | the problem's sentence only |

- **Pending sign-ins:** Continue calls `rememberSignIn(email, "/c")`, so the code link joins at once in the same browser, as sign-in's does.
- **A refusal mid-way,** such as a pause while the code step is open, moves to `refused` with its sentence.
- **After joining:** `forgetSignIn()` and `forgetAccount()`. The account is loaded once (`currentAccount()`); a person who already had a name, such as a member signing in through an old invitation, goes straight to `/c`.
- **The name** is saved with `account.setDisplayName` through `sendNow`, like the sharing dialog's name form. Its refusal shows under the field.

### 4. Shared code pieces

`features/account/code-field.tsx` exports:
- `CodeField`: the label, the input with `autocomplete="one-time-code"`, digit-only normalization and the hint, plus the error line;
- `useResendCountdown(email)`.

The sign-in verify page and the join page both use them, so the field behaves the same in both.

### 5. auth-client

- **A new `AuthFailure` reason,** `refused`, carries a problem's `detail` for 403, 404 and 410. `authFailureMessage` returns that detail.
- **New calls:** `lookUpInvitation(token)` answers `{ ok, email }`, plus `requestJoinCode(token)` and `joinWithCode(token, code)`.

### 6. First run

`RootView`'s empty state gets a second action, a ghost link "Connect an AI assistant" to `/settings/connections` (DS-105).

## Risks / Trade-offs

- **[Admissions paused during e2e tests]:** TON-74's admin test pauses service-wide. The join test lives in the same file, which runs its tests in order (`mode: "default"`), so a pause never lands mid-join.
- **[A signed-in visitor opens a join link]:** joining sets the new account's cookie, which replaces the session in that browser. The landing doesn't warn; a person rarely opens their own invitation while signed in as someone else.

## Migration Plan

None.

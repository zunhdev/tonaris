---
name: mobile-polish
description: Make Tonaris feel native in phone browsers and as a Home Screen app. Match a symptom (stuck hover, tap flash, wrong height, zoom into inputs, pull-to-refresh, notch, laggy taps) to its cause and the fix, and say what needs a real phone to confirm. Use when working on mobile layouts or fixing something that looks or feels wrong on a phone.
---

# Mobile polish

On phones, Tonaris supports browsing and search, in the browser and as a Home Screen app (`apple-mobile-web-app-capable`). Past fixes show the kind of thing that goes wrong: the top bar blurred on iOS 26 (TON-135), pull-down reloaded the Home Screen app (TON-139), menu items under 44 px (TON-152), and inputs under 16 px that made iOS zoom (TON-101).

## Rules

- **Give each fix its reason.** `select-none` on a button is right; on body text it's a defect.
- **Ask the browser what it can do, never which device it is.** Use `(hover: hover)`, `(pointer: fine)`, `env()` and `dvh`, never a user-agent check.
- **Never disable zoom.** No `user-scalable=no` or `maximum-scale=1`. Fix the input's font size instead.
- **Emulation isn't a phone.** Sticky hover, tap delay, rubber-banding, safe areas and the keyboard only show on hardware. The `pixel` and `iphone` Playwright projects (`e2e/mobile.e2e.ts`) catch layout, not feel.

## Symptoms

| What happens | Cause | Fix |
| --- | --- | --- |
| A hover style stays after a tap | `:hover` applies on touch | Gate it: Tailwind's `hover:` variant does this by default since v4; check custom CSS for bare `:hover` |
| Gray or blue flash on tap | WebKit's tap highlight | `-webkit-tap-highlight-color: transparent` on `html` |
| The layout is too tall, and the bottom hides behind the toolbar | `100vh` | `h-dvh` for the app shell, `svh` for a page that scrolls |
| iOS zooms into a field | Its font is under 16 px | 16 px on phones (DS input rule, TON-101) |
| Taps feel slow | Feedback waits for `click` | `active:` styles, and `touch-action: manipulation` on controls |
| Pull-down reloads or bounces the app | Overscroll | `overscroll-behavior: none` where the app owns scrolling (TON-139) |
| Content sits under the notch or home bar, or `env(safe-area-inset-*)` is 0 | No `viewport-fit=cover` | Add it to the viewport meta in `routes/__root.tsx`, then pad with `env(safe-area-inset-*)` |
| A long press selects a button's text | Text selection on controls | `select-none` on controls only |
| A horizontal row scrolls the page instead | The gesture isn't scoped | `touch-action: pan-x` on the row |
| The status bar's color doesn't match | `theme-color` | The app has only the dark theme, so one `theme-color` is right; keep it equal to the `bg.app` token |
| Fine in Chrome, wrong on the phone | Emulation | Check on the phone, with Safari's Web Inspector, against the deployed app or an HTTPS tunnel to the dev server. The session cookie is `Secure`, so Safari refuses it over plain `http://<mac's IP>` |

## Report

- **What was wrong:** the symptom, and its cause in one line.
- **What changed:** each file and declaration, one line each.
- **What needs a phone:** which fixes were confirmed in code or the mobile Playwright projects, and which the creator should check on their iPhone. One line each, not steps.

*Adapted from Emil Kowalski's `mobile-native` skill (MIT); see `../THIRD_PARTY_NOTICES.md`.*

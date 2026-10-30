# Design

## Context

- **Chrome's install criteria** (web.dev, checked 30 October 2026): HTTPS, a manifest with a name, 192 and 512 px icons, a start URL, a standalone-like display, and no preferred related app, plus some engagement. A service worker is no longer among them.
- **iOS Safari** installs any page with Add to Home Screen. `apple-touch-icon` gives the icon, and `apple-mobile-web-app-capable` (or a standalone manifest) opens it without Safari's bars.
- **TON-114** made the icons, including a maskable one.

## Goals / Non-Goals

**Goals:** install from Android Chrome's menu and iOS's Add to Home Screen, with the icon, and open full screen.

**Non-Goals:**
- offline launch, which needs a service worker caching the app shell (section 2.3 keeps the app online-only);
- an install button in the app, or prompts;
- push notifications.

## Decisions

### 1. A static manifest

`public/manifest.webmanifest` is served as a file, with Bun's `application/manifest+json`. Nothing in it changes per deploy or per person. The CSP's `default-src 'self'` already allows it.

### 2. Start at the collection

`start_url` is `/c`, the collection. Signed out, the app redirects to sign-in as any page does. The scope is the whole site, so links within Tonaris stay in the installed app.

### 3. Dark bars

`theme_color` and `background_color` are `bg.app`, so the splash screen and system bars match the dark-only theme (DS-11). On iOS the status bar is `black`, not translucent, so the top bar keeps its place below it.

### 4. Tested through Chrome's view of the manifest

The browser test asks Chrome, through the DevTools protocol, which manifest it loaded, then checks the install criteria against it and that every icon is served. Chrome's own installability check reports nothing in headless mode, even with the manifest missing, so it can't be relied on.

## Risks / Trade-offs

- **Without a service worker,** an installed app opened offline shows the browser's offline page. A later change can add one.
- **iOS caches the home-screen icon** when it's added. A new logo needs the app added again.

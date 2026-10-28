# Tonaris — spike: opening a service's desktop app, 28 October 2026

Spike for [TON-47](https://linear.app/zunhdev/issue/TON-47), which asks for desktop app-scheme behavior to be verified before the "Open in…" chooser is built (TS-43). TS-43 had left two things open: whether Apple Music's `music://` opens an album, and whether Tidal's desktop app has a link scheme at all.

## Verdict

**Every service's desktop app registers a scheme that names an album. The web page stays the primary action on desktop, and the app is a second, explicit choice, as TS-43 decided.**

| Service | Scheme | Album | Track | How it was found |
| --- | --- | --- | --- | --- |
| Spotify | `spotify:` | `spotify:album:{id}` | `spotify:track:{id}` | registered by Spotify.app; Spotify's documented URIs |
| Apple Music | `music:` (also `musics:`, `itms:`, `itmss:`) | `music://music.apple.com/{sf}/album/{id}` | `music://music.apple.com/{sf}/album/{id}?i={song}` | registered by Music.app; the canonical URL with the scheme replaced |
| Qobuz | `qobuzapp:` | `qobuzapp://album/{id}` | `qobuzapp://track/{id}` | registered by Qobuz.app; the route from TS-43 |
| Tidal | `tidal:` | `tidal://album/{id}` | `tidal://track/{id}` | registered by TIDAL.app; its handler read |

- **Tidal** strips `tidal://` and hands the rest to its in-app navigation (`navigationController.goTo("album/{id}")`), which opens the same paths as tidal.com. Its handler treats deep links as untrusted and only navigates.
- **Qobuz** passes the whole `qobuzapp://` URL to its interface, which it loads from Qobuz's servers, so the route couldn't be read locally. `qobuzapp://album/{id}` is TS-43's form.
- **Spotify and Apple Music** follow their documented forms. Apple's canonical album URL keeps its storefront, which `music://` needs.

## Method

On this Mac (macOS 27.2), with the four apps installed (Spotify 1.3.5, Qobuz 8.3.0, TIDAL 2.47.0, Music 1.7.2):

1. **The registered schemes:** each app's `CFBundleURLTypes`, read from its `Info.plist`. LaunchServices hands a link to the app that registers its scheme.
2. **The routes:** Tidal's and Qobuz's handlers, read from their app bundles, without launching anything.
3. **Not done: launching the apps from a browser.** That opens apps on the creator's machine, and browsers each ask first (below). It is a manual check for end-product testing (below).

## What browsers do with an app link

From the browsers' known behavior, not measured in this spike:

- **Chrome and Edge** ask once, "Open Spotify.app?", with an "Always allow" box. With no app for the scheme, nothing happens.
- **Firefox** asks which app to use, the first time.
- **Safari** asks or opens the app directly. With no app for the scheme, it reports that it can't open the page.
- **No browser tells the page** whether the app opened. A page can only notice that it lost focus, as it does when an app comes forward.

## Recommendation

1. **Desktop:** "Open in Spotify" opens the canonical `https` page in a new tab: it always works, and services hand over to their app from there. Beside it, "App" opens the scheme above. Choosing it is the person's explicit choice of the same service (FR-06.5, FR-06.6).
2. **When the app may not have opened:** the page can't tell. If it keeps the focus for 2 s after "App", the chooser says the app may not be installed and offers the same service's web page. It never switches service.
3. **Mobile:** the canonical `https` URL, whose universal and app links open the installed app (TS-43).

## Manual check left (end-product testing)

In Chrome, Safari and Firefox on macOS, with each app installed and signed in, choose "App" for an album of each service and see that the app opens on that album. Then do the same for a track link's album.

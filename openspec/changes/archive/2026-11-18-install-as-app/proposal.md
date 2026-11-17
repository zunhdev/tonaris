# Proposal

## Why

The creator wants Tonaris on a computer as an app to switch to, not a browser tab. Their desktop-app evaluation (18 November 2026) chose the installed web app over a wrapped one (Tauri, Electrobun, Electron): the manifest already lets Chrome, Edge and Safari install it (TON-115), but nothing in Tonaris says so, and a link opened in the installed app opens another window. Linear: TON-298. Rules: section 2.2, DS-94.

## What Changes

- Settings → Preferences ends with an App section, on every device, saying how to install Tonaris in the browser at hand: Chrome and Edge's own prompt from an Install Tonaris button when they offer it, File → Add to Dock in Safari on a Mac, Share → Add to Home Screen on an iPhone or iPad, and directions for each browser elsewhere.
- In an installed app's window, and after installing from the button, the section says so instead.
- The manifest's `launch_handler` asks Chrome and Edge to bring the installed app's open window forward for a link; the window goes to the link without reloading.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: Preferences says how to install Tonaris, and links open in the installed app's open window.

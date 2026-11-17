## ADDED Requirements

### Requirement: Preferences says how to install Tonaris
Settings → Preferences SHALL end with an App section, on every device, saying how to install Tonaris in the browser at hand: an Install Tonaris button opening Chrome or Edge's prompt when they offer it, File → Add to Dock in Safari on a Mac, Share → Add to Home Screen on an iPhone or iPad, and directions elsewhere (section 2.2, DS-94, TON-298). Installed, it SHALL say so instead.

#### Scenario: Chrome offers to install
- **WHEN** Chrome offers to install Tonaris and a person chooses Install Tonaris in Preferences, then accepts the prompt
- **THEN** the section says Tonaris is installed, and the button is gone

#### Scenario: Safari on a Mac
- **WHEN** a person opens Preferences in Safari on a Mac
- **THEN** the App section says to choose File → Add to Dock

#### Scenario: Already installed
- **WHEN** a person opens Preferences in Tonaris's installed app
- **THEN** the App section says they're using Tonaris as an installed app

### Requirement: A link opens in the installed app's open window
On a computer, Chrome's install criteria SHALL find nothing missing in the manifest. Its `launch_handler` SHALL ask for an installed app's open window to be brought forward for a link, and that window SHALL go to the link without reloading, unless it is already there (section 2.2, TON-298).

#### Scenario: A link to Unsorted
- **WHEN** Chrome brings an installed Tonaris window open on Collection forward for a link to Unsorted
- **THEN** the window shows Unsorted, in the same page

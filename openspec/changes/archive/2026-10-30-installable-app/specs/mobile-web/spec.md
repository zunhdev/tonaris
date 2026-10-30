# Spec Delta

## ADDED Requirements

### Requirement: Tonaris installs on a phone's home screen
The web app SHALL link a web app manifest that meets Chrome's install criteria: the name "Tonaris", 192 and 512 px icons with a maskable one, the start URL `/c` and standalone display (section 2.2). On iOS, Add to Home Screen SHALL get Tonaris's icon and open it full screen. Opening the installed app SHALL still need a connection (section 2.3).

#### Scenario: Android Chrome
- **WHEN** a person opens Tonaris in Chrome on Android
- **THEN** Chrome loads its manifest, and installing opens it standalone at the collection, or at sign-in when signed out

#### Scenario: iOS Safari
- **WHEN** a person adds Tonaris to the home screen from Safari on iOS
- **THEN** the home screen shows Tonaris's icon, and the app opens full screen

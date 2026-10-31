# Spec Delta

## ADDED Requirements

### Requirement: The privacy notice describes passkeys
The privacy notice SHALL say what Tonaris keeps of a passkey: its public key, its name, the password manager it is in when known, and when it was added. It SHALL say that face, fingerprint and PIN checks stay on the device, and name the 5-minute cookie that opening the sign-in page or adding a passkey sets (FR-11.14). This text change SHALL be a new terms version, so members agree once more (TS-134, decided 31 October 2026).

#### Scenario: Reading about passkeys
- **WHEN** someone reads `/privacy`
- **THEN** it says what a passkey keeps, that biometrics stay on the device, and mentions the 5-minute passkey cookie

#### Scenario: Members agree again
- **WHEN** a member who agreed to the previous version opens Tonaris
- **THEN** the one-time agreement screen shows before their collection

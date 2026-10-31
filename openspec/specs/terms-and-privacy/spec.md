# terms-and-privacy Specification

## Purpose
The terms of use and privacy notice Tonaris publishes, what YouTube's Developer Policies require of them, and members' agreement to the current version before they use Tonaris (FR-11.14, TS-134).

## Requirements

### Requirement: Terms of use and a privacy notice are always reachable
Tonaris SHALL publish terms of use at `/terms` and a privacy notice at `/privacy`, public and readable without signing in, linked from the sign-in pages, shared pages and the account menu.

#### Scenario: Before signing in
- **WHEN** someone on the sign-in page follows "Privacy"
- **THEN** the privacy notice opens without signing in

### Requirement: The texts say what YouTube's policies require
The terms SHALL link to YouTube's Terms of Service and say users agree to be bound by them. The privacy notice SHALL name zunh.dev and the support address, say Tonaris uses YouTube API Services, link to Google's Privacy Policy, and say what is kept, where and for how long, with TS-114's backup wording (YouTube Developer Policies III.A).

#### Scenario: The privacy notice
- **WHEN** someone reads `/privacy`
- **THEN** it names zunh.dev, the support address, YouTube API Services and Google's Privacy Policy

### Requirement: Members agree to the current terms before using Tonaris
Joining SHALL say that continuing agrees to the terms and the privacy notice, and SHALL record the version agreed to. A member who hasn't agreed to the current version SHALL see a one-time screen instead of their collection, with **Agree and continue** and **Sign out**. A later version SHALL ask again.

#### Scenario: Joining
- **WHEN** an invited person continues on the join page and enters the code
- **THEN** their new account has agreed to the current terms, and no screen asks again

#### Scenario: A member from before
- **WHEN** a member who joined before the terms existed opens Tonaris
- **THEN** the screen shows instead of the collection until they agree, and then not again

### Requirement: The privacy notice describes passkeys
The privacy notice SHALL say what Tonaris keeps of a passkey: its public key, its name, the password manager it is in when known, and when it was added. It SHALL say that face, fingerprint and PIN checks stay on the device, and name the 5-minute cookie that opening the sign-in page or adding a passkey sets (FR-11.14). This text change SHALL be a new terms version, so members agree once more (TS-134, decided 31 October 2026).

#### Scenario: Reading about passkeys
- **WHEN** someone reads `/privacy`
- **THEN** it says what a passkey keeps, that biometrics stay on the device, and mentions the 5-minute passkey cookie

#### Scenario: Members agree again
- **WHEN** a member who agreed to the previous version opens Tonaris
- **THEN** the one-time agreement screen shows before their collection

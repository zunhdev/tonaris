# Spec Delta

## ADDED Requirements

### Requirement: A signed-in visitor to the landing page is offered the app
The server SHALL render the landing page the same for every visitor, with Sign in. Once the browser learns the visitor is signed in, each Sign in SHALL become Open Tonaris, leading to `/` (DS-120, TON-185).

#### Scenario: Signed in
- **WHEN** a signed-in person opens `/welcome`
- **THEN** the header, the hero and the close offer Open Tonaris, and none offers Sign in

#### Scenario: Opening the app
- **WHEN** they choose Open Tonaris
- **THEN** their collection opens

#### Scenario: The server's page
- **WHEN** the server renders `/welcome` for a request with a session
- **THEN** the page offers Sign in, as for everyone

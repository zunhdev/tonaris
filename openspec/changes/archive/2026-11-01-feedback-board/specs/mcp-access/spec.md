# Spec Delta

## MODIFIED Requirements

### Requirement: Clients register by metadata document, with a limited fallback
The authorization server SHALL accept clients identified by a Client ID Metadata Document (CIMD), with token authentication `none` or `private_key_jwt`, fetching each document from public addresses only (FR-10.1). It SHALL keep dynamic client registration (DCR) as the fallback, limited to 10 registrations per IP address an hour (decided 29 October 2026). AI clients SHALL get tokens only through the authorization-code grant with PKCE, and refresh tokens, never client credentials.

#### Scenario: A CIMD client
- **WHEN** a client whose ID is the URL of its metadata document starts an authorization
- **THEN** Tonaris fetches the document and the client connects without registering

#### Scenario: Too many registrations
- **WHEN** one address registers an eleventh client within an hour
- **THEN** the registration is refused with `429`, and the earlier clients still work

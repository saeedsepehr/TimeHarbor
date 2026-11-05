# Security status and boundaries

TimeHarbor is an experimental browser extension, not device-level parental control. A four-digit PIN cannot protect against control of the browser profile, extension files, developer tools or the operating system. Checklists are self-reported.

Settings mutations and cloud controls check the actual extension sender and a PIN session where configured. Untrusted strings use textContent; executable code is packaged under CSP. Configurations, cloud documents and network responses have validation and size limits. PINs are salted PBKDF2 verifiers; they are not synchronized.

Google connection is disabled until deployment/configuration and live acceptance. The authorization-code flow uses PKCE, signed expiring state and exact redirect allowlists. OAuth Client Secret and signing keys belong on the HTTPS broker only. The broker handles Google tokens during exchange/refresh and must be trusted for that purpose. Refresh tokens are stored in privileged extension local storage, access tokens in session storage. Neither is exported or returned through public UI messages. This is not a claim of end-to-end encrypted backup or a completed external security audit.

Do not include real PINs, tokens, client secrets or detailed browsing data in public issues. Use the author's contact links in About for sensitive coordination. Do not send secrets in chat; configure server secrets through a trusted hosting secret manager.

Before enabling cloud login or a stable store release, complete the live acceptance checklist in [server/README.md](server/README.md), review deployed-service logging/rate limits and revisit privacy/store data declarations. A successful mocked test does not establish production OAuth correctness or protection against all abuse.

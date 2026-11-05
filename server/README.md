# Google authorization broker — activation pending

This service is prepared for deployment but has not been deployed or tested with a real Google OAuth client. The shipped 0.4 development packages leave Google sign-in disabled. No real OAuth client, secret or account token is included in this repository.

## Architecture and security

The extension generates a random PKCE verifier and SHA-256 challenge. `/start` signs short-lived state bound to the exact extension redirect and challenge. Google returns an authorization code to the broker's fixed `/callback`, which redirects only to an allowlisted extension URL. `/token` checks the signed state and verifier before exchanging the one-use code. The OAuth client secret stays in the service environment. `/refresh` exchanges an existing refresh token with the fixed Google client and the Drive app-data scope.

The broker handles access/refresh tokens during exchange and refresh. It does not receive website reports, and it does not store account tokens in a database or write request/response logs. Reports travel directly from the extension to Google Drive. Whoever operates this broker must be trusted with the OAuth exchange; this is not a zero-trust or audited end-to-end encryption claim.

Controls include HTTPS-only public origin, exact redirect allowlist, PKCE, signed expiring state, strict Chrome extension origins, Firefox extension origins, request-size limits, per-IP rate limiting, fixed Google endpoints, bounded authorization responses, no-store responses and no-referrer redirects. CORS is a browser restriction, not authentication for arbitrary clients. Deploy behind a managed HTTPS service with rate limits, query/body logging disabled, secret management and an appropriate retention policy. Do not rely on the in-process rate limiter as complete denial-of-service protection.

## Setup when project access is available

1. Create/select the owner's Google Cloud project and enable Google Drive API.
2. Configure the consent screen for TimeHarbor and the narrow scope `https://www.googleapis.com/auth/drive.appdata`. Finish any verification Google requires before public availability. Add test users while the app is in testing.
3. Register a web OAuth client with the exact HTTPS broker `/callback` URL. Keep Client Secret in a server secret manager, not an extension build variable or this repository.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a random 256-bit-or-stronger `OAUTH_STATE_SECRET`, `OAUTH_BASE_URL` (HTTPS origin with trailing slash), and `OAUTH_REDIRECTS` (comma-separated exact `browser.identity.getRedirectURL()` results for Firefox, Chrome and Edge).
5. Run `node server/oauth-broker.mjs` behind HTTPS or deploy the provided Dockerfile using a managed HTTPS endpoint. The default bind address is loopback; managed containers can use `HOST=0.0.0.0`. Node 22+ is sufficient; there are no server npm dependencies.
6. Build extensions with `TIMEHARBOR_OAUTH_BROKER` set to that public HTTPS origin. This public address is safe to embed. Never embed Client Secret, refresh tokens or state-signing keys.
7. Confirm stable store IDs and registered redirects before distributing a configured build. Unpacked Chromium IDs depend on the source path and should not be used as production IDs.
8. Complete live acceptance below before calling Google sync ready for release.

## Live acceptance — NOT RUN

- Real Google consent, cancellation, wrong-account selection, redirect allowlisting, token refresh and revoked grants on Firefox, Chrome and Edge.
- Two independent installations: first connection/restore, shared daily and first-use quotas, concurrent usage, simultaneous configuration edits, retry after offline use and no duplicated totals.
- Worker/browser restart during synchronization and OAuth, permission withdrawal, account switching and bounded network failure.
- Drive quotas, initial history upload volume, retention/backup deletion and load/rate-limit behavior on the deployed service.
- Store data declarations and privacy copy for the configured build.

Mocked unit tests cover signed state, PKCE mismatch, callback origins, credential separation, response bounds, independent writers, revision ordering and quota merging. They do not replace live acceptance or an external security audit.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata), [Mozilla identity](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow).

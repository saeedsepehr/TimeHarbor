# Privacy

TimeHarbor's production extension has no analytics, telemetry, advertising, account system or external reporting endpoint. It does not send usage reports to the developer. Browser networking to the websites you visit is independent of this addon.

It stores settings, domain-level usage durations, pause counters and break/quota state in `browser.storage.local`. It does not intentionally store browsing-page contents, titles, keystrokes, passwords or full URL histories. The currently blocked page URL is carried locally in the extension lock-page URL so the user can return to it. Content scripts observe interaction event timing and HTML media playback state, not the text being typed.

Reports can cover configured websites only (default) or all visited ordinary HTTP(S) domains, as selected in Settings. Retention defaults to 90 local calendar days and can be changed. Shortening retention removes older records at the next persisted checkpoint or configuration save. CSV export is explicitly initiated by the user and stays wherever they save it.

The four-digit settings PIN is stored as a salted PBKDF2-SHA256 verifier, using 310,000 iterations. Plaintext PINs are not persisted or logged. Authorization sessions are kept in extension session storage and expire after ten minutes. Failed-attempt backoff persists locally. A local PIN does not protect against someone controlling the device or the extension's files/storage.

The addon requests HTTP(S) host access to observe activity and block top-level navigation; `tabs` for tab/window identity and redirects; `storage` for local state; `alarms` for recovery/checkpoints; and `webRequest`/`webRequestBlocking` for Firefox navigation enforcement. Internal browser pages and restricted origins have different access rules.

The alpha does not download online blocklists yet. If that feature is added, its provider, requests, license and update behavior will be documented before release.

Development-only tests use dummy domains/PINs and an isolated Firefox profile; a test-only script sends synthetic test outcomes to a loopback HTTP server. That script is never included in the production `dist/` or packaged ZIP.

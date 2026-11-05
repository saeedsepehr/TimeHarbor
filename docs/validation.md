# Validation evidence — 0.1.0 alpha

## Executed locally

- Node 22.14.0 on Windows.
- Twelve unit/security tests: quotas anchored at first use, daily aggregation across midnight, pause accounting, manual-block priority, mandatory and global breaks, configuration/domain validation, retention, prototype-key rejection, salted PIN verification/backoff, and exact privileged sender checks.
- Strict TypeScript compilation.
- Mozilla web-ext lint: zero errors, notices or warnings after setting Firefox minimum version 142.
- Firefox browser smoke: **PASS** on Windows Firefox **159.0.1**, using a Selenium-managed isolated profile. It exercises the actual temporary extension: UI form creates a website, the real content script records approximately twelve seconds of foreground usage, the settings form selects Persian and sets a PIN, missing sessions and wrong PINs are rejected, the correct PIN opens a session, pausing/resuming works, and blocked navigation redirects to the packaged lock page.
- English and Persian layout previews rendered and visually inspected. Preview screenshots use demo data on a local HTTP page with a mock browser transport; they are separate from the real-addon functional checks.
- Production dependency audit: zero findings (`npm audit --omit=dev`). Three low-severity findings remain in Mozilla development tooling; see README.

## Test harness design

Firefox deliberately restricts WebDriver's direct navigation/DOM commands on extension documents. `scripts/firefox-smoke.mjs` copies the production build to an ignored `work/` directory and appends `scripts/firefox-harness.js` only to the temporary test copy. That helper runs as an ordinary extension options-page script and sends the same messages the UI sends; its synthetic results are posted to a loopback test server. No test helper is copied to `public/`, production `dist/`, or the packaged ZIP. The server is closed and the temporary browser quits afterward.

The browser test does not use a normal user Firefox profile, real PIN, third-party website, or production account. Firefox/geckodriver may be downloaded automatically by Selenium Manager when absent.

## Not established by these results

- Firefox/macOS and Firefox/Linux behavior, or any Chromium build.
- Complete compatibility with YouTube/Aparat media modes, cross-origin players or Picture-in-Picture.
- Full runtime/UI code coverage. Unit coverage numbers apply only to modules loaded by the unit tests; they do not imply background/UI coverage.
- Sustained-load CPU/memory benchmarks, comprehensive accessibility or native-speaker translation review.
- Online adult-domain filtering, administrative removal protection, Mozilla signing or store acceptance.

The first RED checkpoint is preserved in Git, followed by the working implementation and its test evidence. Do not report these untested items as complete.

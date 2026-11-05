# Validation evidence — 0.3.0 alpha

## Executed locally

- Node 22.14.0 on Windows.
- Twenty-four unit/security tests: quota/break policies, PIN authorization, retention, profile migration/reassignment, copy targets, settings round-trip with credential exclusion, malformed/oversized imports, imported ID collisions, Chromium network precedence and safe return-URL parsing.
- Strict TypeScript compilation.
- Mozilla web-ext lint: zero errors, notices or warnings after setting Firefox minimum version 142.
- Firefox browser smoke: **PASS** on Windows Firefox **159.0.1**, using a Selenium-managed isolated profile. It exercises the actual temporary extension: UI form creates a website, the real content script records approximately twelve seconds of foreground usage, the settings form selects Persian and sets a PIN, missing sessions and wrong PINs are rejected, the correct PIN opens a session, a one-minute quota expires, premature pause requests are rejected, PIN-protected pausing/resuming works, and blocked navigation redirects to the packaged lock page.
- Actual settings-file UI import also passes: confirmation, missing-session rejection, unchanged local PIN and retained quota identity/usage for a matching domain.
- Chromium actual-addon smoke: **PASS** on Windows **Chrome 156.0.8078.36** and **Edge 155.0.4283.45**. Both use the shared actual-addon scenarios, plus a real settings download and forced service-worker termination. Dynamic navigation blocking persists, preserves a return URL containing multiple query parameters, and the lock page successfully wakes the worker. The actual native toolbar action opens the popup with settings/About shortcuts. The About page shows all seven supplied contact/project links.
- Interactive Firefox UI checks: inline website editing, creating a profile from the dropdown without losing a draft, three-step copy review and disabled identical targets, keyboard tooltip access, quota-preserving profile disconnection, compact PIN controls, live/stable break countdown, delayed required checkboxes and immediate Continue enablement, optional check-ins, explicit skip visibility and closing an animated reminder. These run the production UI/content bundle against a local mock transport; core policy tests separately enforce break rules.
- English and Persian layout previews rendered and visually inspected. Screenshots use demo data on a local HTTP page; they are separate from the real-addon functional checks.
- Production dependency audit: zero findings (`npm audit --omit=dev`). Three low-severity findings remain in Mozilla development tooling; see README.

## Test harness design

Firefox deliberately restricts WebDriver's direct navigation/DOM commands on extension documents. `scripts/firefox-smoke.mjs` copies the production build to an ignored `work/` directory and appends `scripts/firefox-harness.js` only to the temporary test copy. That helper runs as an ordinary extension options-page script and sends the same messages the UI sends; its synthetic results are posted to a loopback test server. No test helper is copied to `public/`, production `dist/`, or the packaged ZIP. The server is closed and the temporary browser quits afterward.

The browser test does not use a normal user Firefox profile, real PIN, third-party website, or production account. Firefox/geckodriver may be downloaded automatically by Selenium Manager when absent.

Chromium tests copy `dist-chromium/` to an ignored test directory and append the same test-only helper. Installed Chrome/Edge are launched headless in fresh profiles with local DevTools debugging, using the official `Extensions.loadUnpacked` command. No ChromeDriver or global dependency is required. Only the spawned test browser is closed. Source files for test helpers are not shipped in either package.

## Not established by these results

- macOS/Linux behavior, Chromium versions other than those above, or other Chromium browsers such as Brave, Vivaldi and Opera.
- Complete compatibility with YouTube/Aparat media modes, cross-origin players or Picture-in-Picture.
- Full runtime/UI code coverage. Unit coverage numbers apply only to modules loaded by the unit tests; they do not imply background/UI coverage.
- Sustained-load CPU/memory benchmarks, comprehensive accessibility or native-speaker translation review.
- Online adult-domain filtering, administrative removal protection, Mozilla signing or store acceptance.

The first RED checkpoint is preserved in Git, followed by the working implementation and its test evidence. Do not report these untested items as complete.

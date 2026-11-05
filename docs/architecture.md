# Architecture

TimeHarbor targets Firefox and Chromium desktop MV3. Runtime code is TypeScript, bundled with esbuild and rendered with native DOM APIs and packaged CSS. There is no runtime framework or npm production dependency.

## Boundaries

- `src/core.ts`: pure domain normalization, configuration validation, quota windows, local-calendar aggregation, break rules, checklist enforcement and retention.
- `src/auth.ts`: Web Crypto PIN derivation/verification, failed-attempt backoff, and privileged sender checks.
- `src/background.ts`: Firefox adapters, authoritative policy enforcement, serial mutations, tab/window observations, checkpoints, expiring sessions and messaging.
- `src/content.ts`: interaction/media signals and short on-page usage reminders. It does not receive PIN verifiers or settings authorization tokens and cannot change settings.
- `src/ui.ts`: popup, settings, profiles, reports and lock-page DOM rendering. Untrusted strings use textContent; executable code stays packaged.
- `src/i18n.ts`: seven language dictionaries and time formatting.
- `src/ux-copy.ts`: English/Persian explanatory copy with English fallback.
- `src/ux-policy.ts`: copy-target comparisons, profile reassignment and state reconciliation without resetting quota usage.
- `src/transfer.ts`: size-bounded, versioned JSON settings transfer with whitelisted fields and destination rule-identity preservation. Never transfers credentials or usage.
- `src/network-policy.ts`: pure Chromium declarative-rule generation and safe return-URL parsing.
- `src/platform.ts`: compile-time platform choice; build outputs retain different background/permission models.

## Time accounting

Content scripts report every five seconds while visible and immediately send visibility changes. The background owns time, tab identity, focused-window state and URL identity. Only the visible tab in the focused, non-minimized window can charge time. Hidden/inactive tabs never receive idle grace or a media exception. Interaction refreshes the foreground idle deadline, and foreground HTML media counts while playing. Observations for the same configured domain are coalesced before charging.

Each charge is split at local midnight, the quota reset boundary and any allowance/break boundary. Daily quotas use local calendar days. Periodic quotas anchor on first observed charged use; after expiry, the next charged use starts the next window. Full-URL history is not used for reporting.

Long unobserved gaps above twenty seconds are discarded rather than charging system sleep/downtime. Checkpoints normally persist at ten-second intervals and on important transitions; alarms provide a thirty-second recovery/enforcement opportunity. In-flight time can be lost on crashes. Exact deadline enforcement and media detection remain bounded by observations rather than a hard real-time guarantee.

## Enforcement and authorization

Firefox's blocking webRequest handler evaluates top-level HTTP(S) navigation. Existing tabs are redirected to a packaged lock page after an observed policy violation. Blocking has priority over ordinary pause exceptions. A global break can affect unconfigured ordinary websites, subject to Firefox's restricted-page rules.

Manual blocks and active breaks take precedence over quota pauses. A new pause requires an exhausted quota and the configured PIN. Active paused usage still schedules breaks, while leaving quota usage unchanged. Optional checklist progress can be saved during a break; required confirmations are accepted only after its deadline. Both modes require Continue after the minimum duration. A distinct skip action requires the profile's explicit permission. Completion/skip records and checked labels are stored locally.

The lock-page countdown derives from the absolute break deadline and updates locally once per second without rebuilding the form. Policy refreshes run every five seconds while visible. Field help uses the browser's native title tooltip on hover and a click/keyboard-accessible explanation dialog; hidden descriptions are linked to form controls. Native dialogs provide modal focus handling. Production scripts remain packaged under the existing CSP.

Settings reads, writes and reports require an expiring session when a PIN exists. Sessions are generated after background-side PIN verification and stored in storage.session. Every privileged message checks the actual Firefox-supplied extension ID, extension UUID/host and exact UI pathname. Content-script data only reaches the activity route, which uses Firefox's sender.tab URL instead of a claimed domain.

The fixed four-digit PIN is a deliberate product constraint, not strong device-level protection. A random salt and PBKDF2-SHA256 (310,000 iterations) protect the stored verifier; failed attempts receive persistent exponential backoff. No reset/recovery service exists in this alpha.

## Browser portability

Firefox uses an MV3 event page and blocking webRequest. Chromium uses a separate build with an MV3 service worker, a tiny API namespace alias, PNG manifest icons and declarativeNetRequestWithHostAccess. No third-party polyfill is loaded. The async message listener uses an explicit callback/return-true response path supported by both targets.

Chromium network rules are derived from the same authoritative core verdicts. More-specific domains have higher priority. A global break produces a single HTTP(S) main-frame redirect rule; individual blocked rules redirect to the packaged, web-accessible lock page. Full return URLs use a raw `target=` tail so query separators are preserved; UI parsing accepts only credential-free HTTP(S) targets. Dynamic rules continue blocking while the worker is asleep and are replaced atomically when policy changes. A 30-second recovery alarm reconciles time-dependent rules; after a deadline, an old rule may remain briefly until that alarm or another event wakes the worker. The lock page then re-evaluates current policy.

Chromium persists observed tab activity/reminder checkpoints in storage.session alongside local usage checkpoints. A restored worker discards long unobserved gaps, reacquires active tabs/windows, and regenerates rules. It does not use a keepalive loop. Manual file transfer is available. Google shared-usage sync is prepared but gated on deployment/credentials and live acceptance; the shipped build leaves it disabled.

## Optional cloud boundaries — activation pending

`server/oauth-broker.mjs` handles authorization-code exchange/refresh with a server-side secret, signed expiring state, exact browser redirect allowlists and PKCE. The extension receives Google tokens only in privileged code; refresh credentials stay in local extension storage and access tokens in session storage. Messages and exports never return them. Account authorization runs outside the serial accounting queue.

`src/drive.ts` reads/writes only the application's Drive app-data namespace. `src/sync-policy.ts` merges the latest per-installation/day snapshots and recomputes shared quotas from consumed intervals, with canonical window hints and a shared time zone. Local break state and PINs are not synchronized. Old aggregate reports can be transferred; their missing exact activity intervals are not invented for historical charts. Current quota counters are carried into the initial ledger.

`src/cloud-exchange.ts` uses independent writer filenames, version validation, response limits, at most eight fresh reads/twelve file requests per batch and a 4 MiB remote cache cap. Newest usage/settings are processed first, unchanged content is not uploaded again, and partial history continues in later batches. Only short snapshot/commit operations enter the accounting queue. Cloud refresh is approximately once a minute while running; it is eventually consistent and cannot impose a real-time cross-device cap while offline. Live Google and deployed-service tests remain required.

References: [Chrome declarative network rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [Firefox actions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/action).

## Performance and privacy

Only visible/media-active content sends regular observations. DOM listeners set a flag rather than messaging on every mouse movement. Media discovery is a lightweight query of HTML media elements; no page-text scanning, content classifier, continuous screenshotting or full-DOM mutation observer is used. Settings/report pages load on demand. Actual performance benchmarks still need to be collected before making quantitative overhead claims.

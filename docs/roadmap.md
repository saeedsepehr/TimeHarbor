# Roadmap

## 0.1 alpha — implemented

- Pure quota/break/reporting core and strict configuration validation.
- Firefox MV3 event-page adapter and network-level manual blocking.
- PIN verifier, settings authorization, pause limits and expiring sessions.
- Local reports, date ranges and CSV export.
- Site rules, reusable break profiles and bulk copying.
- Seven-language menu surface, Persian/Arabic RTL, popup and lock page.
- Unit/security tests, isolated Firefox smoke harness and English/Persian UI previews.

## 0.2 alpha — implemented

- Inline editors, contextual help, linked-site management and a three-step copy wizard.
- Live break countdown, delayed required confirmations, optional progress and local activity reports.
- Explicit per-profile early-skip setting, off by default; quota pauses cannot bypass breaks.
- Animated dismissible usage reminders, compact PIN controls and an indigo visual refresh.
- Conservative migration of existing profiles without resetting their quota usage.

## 0.3 alpha — implemented

- Firefox and Chromium MV3 builds with shared TypeScript core/UI.
- Chromium service worker and declarative network rules; session checkpoints for observation recovery.
- Reviewed JSON settings export/import, excluding PINs, sessions and browsing reports.
- Native hover help with an accessible click-to-read dialog, toolbar menu shortcuts and PNG toolbar icons.
- About page with Saeed Sepehr's note and the supplied contact links.

## Before a public stable release

1. Add a reviewed, licensed adult-domain list provider with bounded parsing, cached last-known-good data, update status and PIN-protected exceptions. Do not download executable logic or send browsing domains to a classification service.
2. Validate media behavior on YouTube and Aparat, cross-origin media, Picture-in-Picture, multiple windows/tabs and browser crash/restart/sleep scenarios. Refine clock changes and timezone behavior.
3. Extend actual-addon end-to-end coverage beyond quota expiry to idle cutoff, first-use reset, mandatory checklist and global breaks; expand accessibility, language and keyboard testing. Current interactive break/editor tests use the real UI with a local mock transport.
4. Validate Firefox on macOS and Linux and record measured CPU/memory/package metrics. Confirm performance for large rule/report sets.
5. Design PIN recovery and explicit pause policies for parent/child setups. Provide a separate, transparent administrative Firefox-policy guide; do not promise removal prevention for ordinary installs.
6. Finish translation review and localized errors/reminder text. Improve onboarding, report refresh and explicit profile-copy confirmation.
7. Resolve upstream development-tool audit findings, publish reproducible source/build artifacts, complete Mozilla review/signing and ship a permanently installable version.

## Later

- Automatic cross-browser sync after designing an explicit opt-in service, encryption, conflict handling and account/privacy model. Native browser sync does not bridge Firefox, Chrome and Edge accounts.
- Richer report grouping, pause-time daily budgets and accessible charts.
- Additional family/account features only after a separate privacy/permission design; no cloud history upload by default.

The exact name is **TimeHarbor**. The initial misspelling was corrected through a repository rename without rewriting Git history.

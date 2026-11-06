# Firefox extension development

Product and repository name: **TimeHarbor**. Runtime source is in `src/`, static extension assets in `public/`, tests in `tests/`. Use `npm run typecheck`, `npm test`, `npm run build`, `npm run build:chromium`, `npm run lint:extension`, `npm run format:check` and the isolated `npm run test:firefox`, `npm run test:chromium`, `npm run test:edge` as appropriate. Browser targets are Firefox desktop 142+ and Chromium 120+. The alpha is unsigned; do not describe it as a permanently installable Firefox or store-published release.

## Scope and product

Build a lightweight, privacy-first desktop WebExtension for Windows, macOS, and Linux. Chromium now uses a separate MV3 build with a service worker and declarative network rules; Firefox retains its event page and blocking webRequest adapter. Preserve both targets and the shared core. No extension source or dependency stack existed when ECC was integrated. Do not introduce a framework, migrate code, or initialize/publish a repository merely to run ECC checks.

Confirmed behavior: quota windows start at first use. Count only a visible tab in the focused, non-minimized browser window; inactive tabs/windows stop immediately, including media, without idle grace. The idle threshold applies only to the visible foreground site. Legacy backgroundMedia fields migrate to false. Breaks affect the current site by default with profile-level scope; personal-use defaults with simple parent/child setup; reporting scope chosen during onboarding, 90-day default retention and CSV export. New installations use the browser UI language, with a manual override. Product name: TimeHarbor. Intended GitHub owner: saeedsepehr; browser sign-in alone does not prove connector identity or write permission.

Google Drive sync is prepared but disabled until the owner provides a Google Cloud project and an HTTPS OAuth broker is deployed/configured. Shared settings, reports and quotas are the intended cloud behavior. Keep OAuth client secrets server-side, use PKCE and signed state, never expose tokens through public messages/exports, and do not claim live Google acceptance from mocked tests. See server/README.md before activation. Offline automatic cross-browser sync would need a separately installed native companion; it is not implemented.

## Workflow: plan → implement → test → review → verify

Use ECC as an on-demand reference, not a mandatory ceremony. Scale effort to the change. For copy, color, documentation and repository metadata edits, make the focused edit and verify the affected output; do not load skills, write implementation-mirroring tests or run the full browser suite by default. For substantial behavior changes, use the workflow below. Project-specific regression tests and observable browser behavior take priority over generic checklists. Load only the relevant ECC reference when it adds value; no need to invoke all six skills for every task.

For timing, state or enforcement changes, cover relevant empty configuration, rule/profile removal, tab switches, unfocused/minimized windows, browser/worker restart, quota rollover and simultaneous break/quota expiry. For PIN, permissions, imports or cloud changes, include targeted security/privacy review. Run only applicable checks; broaden testing after failures, new changes or unresolved risks. Keep hooks, automatic learning/memory and extra agents disabled; do not change user-global plugin configuration merely to apply this project workflow.

1. Plan the behavior, acceptance criteria, affected surfaces, and risks before substantial work. Use ECC's planner and architect references only when relevant.
2. Implement a focused change; consult `ecc:coding-standards` or `ecc:typescript-patterns` when useful. Keep domain/time accounting separate from Firefox APIs and UI. Consult `ecc:frontend-a11y` when useful for forms, dialogs, focus, keyboard interaction, semantic HTML, and RTL. Its React examples do not require adopting React.
3. Write meaningful regression tests for logic changes and bugs; consult `ecc:tdd-workflow` as needed. Detect existing tools first; adapt shell examples to PowerShell. Do not install packages or create low-value tests just to satisfy a generic example. For this extension, prioritize clocks, rollover, idle/media state, multiple tabs, persistence, pause limits, PIN authorization, and break enforcement.
4. Review the complete change for correctness, security, privacy, performance, and missing tests. Read ECC's `agents/code-reviewer.md` when a detailed review is useful. Use `ecc:security-review` for PINs, messages, imports, permissions, and external lists. Follow `agents/build-error-resolver.md` for bounded build fixes. Agent prompt frontmatter does not change the active model or create native agents.
5. Verify the affected behavior before declaring completion; consult `ecc:verification-loop` for substantial changes when useful. Run applicable build, type, lint, test, extension-validation, and diff checks using tools already present. Record PASS, FAIL, NOT RUN, or NOT APPLICABLE truthfully. Local checks do not establish behavior on all three operating systems.

## Firefox constraints

- Check current Mozilla documentation for WebExtensions APIs, permissions, MV3, CSP, and store policy before implementation choices. Firefox MV3 uses event pages; do not assume Chrome service workers apply unchanged.
- Request and explain only necessary permissions. Use host permissions appropriate to the selected reporting/blocking scope.
- Package executable code with the extension. No remote executable code, eval, or CSP relaxation. Treat downloaded blocklists as validated data.
- Validate message schemas and sender identity in privileged handlers. Enforce PIN/session authorization in the background, not only the UI. Do not persist plaintext PINs or expose authorization material to content scripts.
- Prefer textContent for untrusted text. Keep CSP compatible with packaged scripts/styles and review extension-page versus page-content trust boundaries.
- Keep browsing reports local by default; never log PINs, page contents, or detailed URLs unnecessarily. Handle inaccessible/restricted pages honestly.
- Use event-driven accounting with durable checkpoints and recovery. Measure performance before claiming low overhead. Do not claim ordinary installs can prevent removal or that domain lists classify all platform content.

## ECC integration

ECC 2.2.3 is installed as the native `ecc@ecc` plugin. Only six skills above are enabled. Do not install copied skills into `.agents/skills` or run the legacy sync on top of it. Hooks and the Chrome DevTools MCP remain disabled. No automatic learning, memory runtime, scanner, or global npm dependencies were installed.

Read `docs/ECC-WORKFLOW.md` only when installation, invocation, verification, or update details are needed. Read skill bodies on demand; do not load the whole ECC repository. Preserve user settings and respect the active permissions. Do not spawn subagents unless the user explicitly requests delegation or applicable higher-priority instructions permit it.

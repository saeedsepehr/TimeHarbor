# ECC for this Firefox extension

## Installation and activation

The official native lifecycle was used:

```powershell
codex plugin marketplace add affaan-m/ECC --json
codex plugin add ecc@ecc --json
```

Installed version: 2.2.3. Source commit: b38be6a7f6350964d59328b52f0624e1d1d552d1.
Native cache: `<CODEX_HOME>/plugins/cache/ecc/ecc/2.2.3`.
User configuration: `<CODEX_HOME>/config.toml`.

The `ECC FIREFOX WORKFLOW` block disables unrelated skill paths, migrated command skills, the plugin's Chrome DevTools MCP, and its SessionStart hook. Existing settings were preserved; a pre-change backup is under `work/ecc-backup/config-before.toml`. Do not publish that backup because user configuration can contain private values.

Native installation applies to Codex sessions using this user home. This curated ECC selection therefore applies to other local chats using the same home as well. The bundled files remain intact in the cache; disabled skills are excluded from normal use. No second copied-skill installation is present.

## Invoking skills

The actual app-server discovery names include the `ecc:` namespace:

- `$ecc:coding-standards` — code readability and general conventions.
- `$ecc:typescript-patterns` — JavaScript/TypeScript design, narrowing, async handling, and boundaries.
- `$ecc:frontend-a11y` — semantic HTML, keyboard and focus behavior; adapt examples to the chosen UI stack.
- `$ecc:security-review` — input, authorization, secrets, and sensitive-data review; apply extension-specific rules from AGENTS.md.
- `$ecc:tdd-workflow` — test-first logic and regression fixes using the project's actual runner.
- `$ecc:verification-loop` — explicit verification before completion.

Example request: "Use $ecc:security-review to inspect the background message handlers and PIN authorization. Report concrete findings without editing code."

Natural-language requests can also select the relevant skills. Start a new turn or restart the app if the running chat has not refreshed its skill selector. Recognition was independently checked through a fresh local Codex app-server; it does not prove the existing desktop conversation has refreshed.

## Planning, architecture, debugging, and review

The native cache includes `agents/planner.md`, `agents/architect.md`, `agents/build-error-resolver.md`, and `agents/code-reviewer.md`. Read them only for relevant work. These are instruction references, not automatically registered Codex subagents. Their Claude tool/model metadata is not a runtime configuration for this project. No experimental agent flags or extra agents were enabled. Delegation requires an explicit request; the current assistant can perform these review and planning workflows directly.

## Verification

With Codex on PATH, run:

```powershell
node scripts/verify-ecc.cjs
```

If the executable is only available by absolute path, pass it as the first argument. The script initializes a temporary local app-server, lists skills and hooks, verifies exactly the six expected skills, and writes evidence to `work/ecc-runtime-verification.json`. It does not start a model conversation or execute hook commands. The upstream cache checker can also be run against the active cache root:

```powershell
node /path/to/ECC/scripts/codex/check-plugin-cache.js --plugin-dir /path/to/active/plugin/cache
```

Machine-local setup reports and receipts live under ignored outputs/ and work/ directories. Extension validation is documented in docs/validation.md. <CODEX_HOME> means the active user Codex configuration directory; substitute its actual path on your computer.

## Updates and limitations

- Hooks remain disabled and untrusted. Hook dependencies were not installed; enabling hooks later is a separate reviewed decision.
- Chrome DevTools MCP is disabled. Firefox testing must use Firefox-compatible tooling; CDP tooling does not establish Firefox extension behavior.
- The six skill bodies contain examples for other stacks and Unix shells. Use the project's actual package manager, PowerShell, tools and relevant checks; do not blindly run examples or add dependencies.
- The version-specific disabled paths must be reconciled when upgrading ECC. First inspect `codex plugin list --json`, back up config, review upstream changes, upgrade deliberately, update selectors and rerun verification before using a new version. Do not run a marketplace upgrade without rechecking the selected skill set and hook/MCP policy.
- No extension build or cross-platform browser test exists yet; those are not installation prerequisites and have not been claimed to pass.

Sources: https://github.com/affaan-m/ECC/blob/main/.codex-plugin/README.md and https://learn.chatgpt.com/docs/build-skills.

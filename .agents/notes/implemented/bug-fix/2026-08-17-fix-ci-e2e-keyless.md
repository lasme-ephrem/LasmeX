# Agent Note: Keyless e2e fixtures drift revealed by the first keyed e2e run

Status: implemented

English | [中文](2026-08-17-fix-ci-e2e-keyless.zh.md)

## Problem

The `E2E (real DeepSeek API)` job's preflight fails without `DEEPSEEK_API_KEY`, so the keyless e2e tests included in `pnpm run test:e2e` had never actually run in CI. The first run after the key was configured surfaced four fixtures whose expectations predate current product behavior, plus one shell-test predicate that matched the wrong notice. The job also never ran on same-repo PRs: its skip guard read `head.repo.fork`, which is true for this repository (itself a fork of deepseek-harness), so every trusted PR was skipped.

## Decision

Fix the expectations and fixtures to match current behavior, without touching product code:

- `.github/workflows/e2e.yml` detects a cross-repository PR by comparing head and base full names instead of `head.repo.fork`, so same-repo PRs actually run the keyed e2e job (forks and Dependabot stay skipped).
- `examples/jsonrpc-agent/tests/keyless-smoke.e2e.ts` expects the loader's fail-loud boot message in its current locale: `échec du chargement de l'arbre de plugins` (the English `plugin tree failed to load` no longer exists).
- `packages/goal/goal/tests/goal.e2e.ts` pins `CLI_MOCK_TOOL=bash` — the scripted model defaults to `memory_list`, which the goal-domain composition does not mount (it ships `bash`).
- The two `mock-delegating-llm.ts` subagent fixtures scanned only the last message for the tool result, but the agent loop appends a plugin continuation notice after tool results; they now scan messages backwards for it, the same pattern the headless `cli-mock-llm.ts` already uses.
- `packages/subagent/subagent-acp/tests/loader-composition.e2e.ts` gets `processTimeoutMs: 120_000` (two harness runtimes boot in sequence), matching its SDK twin.
- `packages/shell/tool-bash/tests/integration.spec.ts` narrows the background-job notice predicate to the `tool-jobs` completion notice; the loop's own `agent-loop` continuation notice is not the signal the test awaits.

## Alternatives considered

- **Run the keyless tests in a separate job** — rejected: they belong to the existing e2e suite, and a second job duplicates the runner and the Loader smoke setup.
- **Keep the `head.repo.fork` guard** — rejected: it confuses this repository's own fork status with a fork PR and would keep same-repo PRs green-but-skipped forever.
- **Disable the drifting tests** — rejected: they cover real cross-runtime cwd inheritance and fail-loud loader behavior.
- **Revert the product to satisfy the stale expectations** — rejected: the product behavior (French boot message, continuation notices, bash-only goal domain) is intentional.

## Consequences

- The keyless tests now pass in the keyed e2e job and keep guarding their coverage.
- The keyed e2e job now runs on same-repo pull requests (forks and Dependabot remain skipped), so future PRs cannot ship fixture drift silently.
- The shell background-job test distinguishes the loop continuation notice from the real completion notice, removing the macOS `darwin parity` and Linux coverage flakes.

# Agent Note: LasmeX product foundation

Status: implemented

English | [中文](2026-08-14-lasmex-product-foundation.zh.md)

## Problem

An independent fork needs a product identity and local state that do not collide with an installed DeepSeek Harness checkout. Changing only browser copy leaves the inherited command, package namespace, home directory, telemetry path, model-visible identity, and startup signals attached to the upstream product. An independent distribution therefore requires the product surface and the complete harness package family to move together.

## Decision

LasmeX is the public product identity. The launcher exposes only `lasmex`; the browser title, install manifest, startup signal, compact mark, wordmark, model identity, source-orientation prompt, and provider-neutral `User-Agent` use LasmeX. The npm release family uses the unscoped `lasmex` entry package and `lasmex-*` supporting packages; the desktop package stays private because its distributable is the portable application or installer, not an npm runtime. Provider requests send `lasmex/<version> (+https://github.com/lasme-ephrem/LasmeX)`, identifying the official public fork rather than the DeepSeek Harness upstream.

The launcher prepares the process environment before profile parsing. An explicit `LASMEX_HOME` continues to support existing developer automation. Otherwise `LASMEX_HOME` selects the state directory and `~/.lasmex` is the default. The launcher always sets `LASMEX_TELEMETRY_DISABLED=1`, so inherited DeepSeek telemetry cannot be enabled through a LasmeX launch.

Harness package names and imports move atomically to `lasmex` and `lasmex-*`. The TypeScript and [Python SDK public identity](../architecture/2026-08-14-lasmex-python-sdk-public-identity.md) use LasmeX distributions, modules, public high-level classes, executable names, provider names, and server identity. Public TypeScript entry points use `LasmexInvocation`, `parseLasmexArgs`, `LasmexEnvironment`, `LasmexEnvironmentKey`, and `LasmexWindow`; public runtime controls use the `LASMEX_*` namespace. No `Dsh*` aliases or public `DSH_*` compatibility variables are retained.

Retained `DSH_*` names are internal mechanism identifiers, not supported product configuration. Build and gate coordination owns `DSH_BUILD_FACE`, `DSH_RUNTIME_PLATFORM_TAG`, `DSH_DOC_TYPECHECK_USE_BUILD_OUTPUT`, `DSH_NODE_COMPAT_SKIP_TYPECHECK`, `DSH_REQUIRE_BUILT_CLI_SMOKE`, the `DSH_GATE_*`, `DSH_COVERAGE_*`, `DSH_OXLINT_THREADS`, `DSH_PUBLINT_CONCURRENCY`, `DSH_ARCHIVE_BASE_REF`, `DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE`, and CI failover values. Test infrastructure owns `DSH_SNAPSHOT*`, `DSH_EXAMPLE_MODE`, the `DSH_TEST_*`, `DSH_E2E_MAX_WORKERS`, provider-e2e overrides, Wine controls, and Web stress controls. Private process and browser handshakes own `__DSH_BOOT__`, `__DSH_MODULES__`, `DSH_CLAUDE_CODE_EXECUTABLE`, `DSH_DIALOG_TITLE`, persistent-bash framing markers, and translation placeholder tokens. Private origins, symbols, metadata keys, temporary-directory prefixes, the `dsh-translation-pairing` merge-driver identifier, and repository skill identifiers may also retain lowercase `dsh` names. These identifiers may change without a product compatibility promise and must not be presented as user controls or product identity.

The system-prompt plugin accepts `harnessIdentity` as deployment configuration. LasmeX is its default, while another distribution can provide its own order-−100 identity without patching the plugin.

The Git remote named `upstream` tracks `deepseek-ai/deepseek-harness`; the LasmeX branch contains product work. The upstream MIT license and third-party notices remain in the fork.

## Consequences

LasmeX and DeepSeek Harness can run on one machine without sharing their default state. Existing tests and scripts that set `LASMEX_HOME` remain hermetic. The UI no longer displays the DeepSeek whale or wordmark, model providers receive LasmeX application attribution, and npm consumers no longer depend on DeepSeek's package namespace. DeepSeek remains visible where it names the upstream project, a provider or API, a vendored or native package, a provider-specific wire field, or retained legal attribution.

The French locale is a separate acceptance unit. Every typed client namespace has a complete French dictionary, and French is the product fallback; this prevents a nominally French interface from falling through to Chinese or English strings.

## Alternatives considered

| Alternative | Contract mismatch |
|---|---|
| Keep the inherited npm names or a public `dsh` binary alias | LasmeX would still require the upstream namespace or advertise two product commands after the complete family can move atomically. |
| Keep `~/.dsh` as the default | LasmeX and DeepSeek Harness would mutate the same profiles, credentials, settings, and sessions. |
| Leave telemetry configurable | A LasmeX launch could still send inherited product telemetry to a DeepSeek endpoint without a LasmeX consent surface. |
| Advertise the DeepSeek Harness upstream as the LasmeX product URL | Provider logs would link the LasmeX identity to the wrong product. The official LasmeX fork is the product URL; the DeepSeek repository remains an explicit upstream attribution. |
| Add French as an incomplete locale | The typed locale registry would either reject missing dictionaries or expose a mixed-language product. |

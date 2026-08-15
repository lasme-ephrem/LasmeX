# Agent Note: LasmeX Python SDK public identity

Status: implemented

English | [中文](2026-08-14-lasmex-python-sdk-public-identity.zh.md)

## Problem

The LasmeX product foundation left the public Python distributions, import modules, high-level SDK class, packaged executable, and JSON-RPC server identity under LasmeX names. A partial rename would make installation, imports, diagnostics, wheel contents, and the shared TypeScript client disagree about which product they drive. Pre-release aliases would preserve two public vocabularies without an external compatibility obligation.

## Decision

The Python distribution family uses one LasmeX vocabulary with no compatibility aliases:

| Interface | Name |
|---|---|
| Client distribution | `lasmex-sdk` |
| Runtime distribution | `lasmex-runtime-bin` |
| Client module | `lasmex` |
| Runtime module | `lasmex_runtime` |
| High-level Python API | `LasmeX`, `LasmeXConfig`, `Session`, `RunResult` |
| Low-level Python API | `LasmeXClient`, `LasmeXClientConfig`, `LasmeXError` and its existing subclasses |
| Runnable bin | `lasmex-jsonrpc-agent` |
| Deploy root and native artifacts | `lasmex-jsonrpc-agent-pkg`, `lasmex-jsonrpc-agent-pkg-<platform>-<arch>` |
| JSON-RPC server identity | `lasmex-sdk-runtime` |
| TypeScript high-level API | `LasmeX`, `LasmeXOptions` |
| Subagent provider package | `lasmex-subagent-lasmex-sdk` |
| Subagent provider id | `lasmex-sdk` |

Source paths, wheel metadata, same-version dependency pins, build hooks, release workflows, runtime manifests, fixtures, tests, snapshots, and current documentation use these names together. npm import specifiers use the migrated `lasmex-*` package family; the subagent package's LasmeX-specific suffix and provider id do not preserve the removed `dsh-sdk` product identity.

The Python package metadata identifies `LasmeX contributors` as the author. `Homepage`, `Repository`, `Issues`, and `Source` point to the official public fork at `https://github.com/lasme-ephrem/LasmeX`; `Upstream` alone points to `https://github.com/deepseek-ai/deepseek-harness`.

`LASMEX_CORDIS_CONFIG`, `LASMEX_SESSION_ROOT`, `LASMEX_CWD`, and `LASMEX_RUNTIME_MODE` are the public runtime controls. `DSH_RUNTIME_PLATFORM_TAG` remains a build-time package-selection handshake, not a supported user control. Other retained `DSH_*` names are likewise limited to build, test, or private wire coordination and are not part of the Python SDK configuration surface.

This decision specializes the [LasmeX product foundation](../feature/2026-08-14-lasmex-product-foundation.md). It partially supersedes the public Python names, executable lineage, TypeScript high-level class, `serverInfo.name`, subagent package suffix, and subagent provider id retained by the [repository naming decision](2026-08-11-repository-naming-contract-and-rename-ledger.md). The other npm SDK package names, JSON-RPC methods and payload fields, runtime packaging mechanism, publication controls, and required native CI remain owned by their existing decisions.

## Consequences

Python consumers install `lasmex-sdk`, import `lasmex`, and use the LasmeX class family; removed upstream distribution, module, class, and executable names fail instead of selecting an alias. Release automation publishes the two LasmeX distributions and packages the LasmeX executable lineage, while platform-native runtime production remains a Linux and macOS CI responsibility. TypeScript consumers use `LasmeX` and `LasmeXOptions`; subagent compositions mount `lasmex-subagent-lasmex-sdk` and select `lasmex-sdk`. A future internal build or wire-prefix migration must update its complete family atomically.

## Testing

The Python unit suite imports only `lasmex` and `lasmex_runtime`, tests the renamed public classes, stages both renamed distributions, and validates native payload names. Release tests build and inspect the pure SDK wheel plus a platform runtime wheel. TypeScript package tests and keyless JSON-RPC examples cover `LasmeX`, the executable references, `serverInfo.name = lasmex-sdk-runtime`, and the `lasmex-sdk` subagent provider through the renamed package. Documentation pairing and current-note checks reject drift in the bilingual references and decision records.

## Alternatives considered

**Keep import aliases for one release.** There is no tagged LasmeX Python release or external compatibility promise. Aliases would require duplicate exports, installation guidance, tests, and removal policy while allowing new code to keep the upstream identity.

**Rename only the Python distributions and modules.** The executable, server handshake, TypeScript wrapper, diagnostics, and wheels would expose several product names for one runtime.

**Keep public runtime controls under `DSH_*`.** That would expose the upstream product namespace in ordinary LasmeX configuration. Public controls therefore use `LASMEX_*`; only non-user-facing build, test, and wire identifiers retain their existing names until their owning mechanism moves atomically.

**Use the DeepSeek Harness upstream as the LasmeX homepage.** That URL identifies the upstream product. The official LasmeX fork owns the product metadata links, while `Upstream` preserves explicit source attribution.

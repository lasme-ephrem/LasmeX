# Agent Note: LasmeX Code as the default agent preset

Status: implemented

English | [中文](2026-08-14-lasmex-code-default-preset.zh.md)

## Problem

The shipped Code Mode composition already reduces model round trips by presenting the complete coding tool catalog through one TypeScript SDK, but its generic identity, Chinese file metadata, and optional position do not define LasmeX's default agent experience. Reimplementing the scheduler or tools would duplicate mature behavior without giving the product a clearer execution policy.

## Decision

The shipped `lasmex-code` preset is the default agent composition for the Web product. It replaces the shipped `code` identifier and retains that preset's capability rows, isolated services, compaction, planning, delegation, goals, skills, and Code Mode presentation. The model sees `run_code`; the scoped tool registry retains the underlying catalog for SDK generation and execution.

The preset contributes a French persona that identifies LasmeX Code, interpolates the selected model and session workspace, requests repository inspection before mutation, requires risk-proportionate verification, and defines the final response fields. It requests confirmation before irreversible actions and material product choices that cannot be resolved from context. These instructions guide the model; the host sandbox and approval plugins continue to enforce permissions.

Built-in preset names and descriptions resolve through the Web locale catalog for French, English, and Chinese. The raw `preset.yml` files use French so non-Web roster consumers also receive LasmeX product copy. `standard`, `minimal`, and `cordis` remain selectable alternatives, and a stored user default continues to override the deployment default.

## Verification

The shipped Web composition test pins the exact preset roster, `lasmex-code` default, Code Mode presentation, underlying SDK catalog, and isolation from a neighboring native session. The keyless `lasmex-code.snapshot.ts` scenario boots the real Web composition, mounts the unnamed default, renders its prompt variables, and snapshots the French persona, `run_code` presentation, representative SDK capabilities, and underlying tool count. Client locale tests pin the localized built-in mapping.

## Alternatives considered

- **Implement a LasmeX-specific agent loop.** Rejected because the existing loop, tool registry, and Code Mode presenter already provide the required execution mechanics; a forked loop would create a parallel lifecycle for prompt policy alone.
- **Keep Standard mode as the deployment default.** Rejected because LasmeX Code would remain an optional upstream-style mode rather than the product behavior a new user actually evaluates.
- **Create LasmeX Code only in the user's writable preset root.** Rejected because product defaults must be reproducible from the shipped composition and must not depend on mutable machine state.

## Consequences

Fresh unnamed sessions use Code Mode and the French execution persona, while existing sessions and explicit preset selections retain their recorded composition. Pre-release sessions recorded with the removed `code` identifier do not receive a compatibility alias. Models that perform better with native tool calls can still select `standard`; maintaining both presentations costs one duplicated composition until preset inheritance exists.

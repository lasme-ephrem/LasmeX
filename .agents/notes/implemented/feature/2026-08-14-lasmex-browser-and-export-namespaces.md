# Agent Note: LasmeX browser and export namespaces

Status: implemented

English | [中文](2026-08-14-lasmex-browser-and-export-namespaces.zh.md)

## Problem

The renamed product still persisted its active Session, per-Session chat state, and Workspace view state under `dsh.*` browser keys. It also downloaded Session archives as `lasmex-session-*.zip`. Running LasmeX beside an upstream Harness deployment on the same origin could therefore mix browser state, and exported files retained the inherited product identity.

## Decision

LasmeX owns the browser namespaces `lasmex.sessions.current`, `lasmex.conversation.chat.<sessionId>`, and `lasmex.workspace.view.v5`. The Host and browser export controllers derive the same `lasmex-session-<safe-id>.zip` filename.

This pre-release change does not migrate or read the inherited keys. Ignoring them keeps LasmeX state isolated and follows the repository's no-compatibility promise before the first tagged release. The internal loopback URL and plugin manifest identifiers are not browser storage and remain outside this decision.

## Consequences

The first page load after this change starts with no active Session or locally persisted layout from an earlier upstream-named build. Durable Session logs, Workspaces, settings, and credentials are unaffected because their Host storage does not use these browser keys. Downloaded archives now carry the LasmeX name without changing their contents.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Copy old keys into the new namespace | A compatibility migration would deliberately mix state from the product this fork is separating from. |
| Keep `dsh.*` as an internal implementation detail | Browser keys and downloaded filenames are user-observable and can collide across products. |
| Rename the ZIP only in the browser | Direct Host downloads and preflight metadata could disagree with the client controller. |

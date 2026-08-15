# lasmex-session-mission

English | [中文](README.zh.md)

Host-only contributor of the `missionActivity` whole-log session projection. It summarizes actual capability use, recent configured validation commands, approval outcomes, the latest todo snapshot, and the latest known non-success turn outcome without adding session events or changing the agent loop. The [mission projection decision](../../../.agents/notes/implemented/feature/2026-08-14-session-mission-activity-projection.md) records why the view reuses existing durable facts.

## Configuration

All fields are required deployment choices; the plugin has no hidden operational defaults.

| Field | Meaning |
|---|---|
| `maxRecentValidations` | Positive integer bounding the complete `validations` array. |
| `validationCommandTools` | Exact tool names whose string `command` argument and rendered shell status are interpreted. Entries must be non-blank and unique; an empty array disables command-aware classification. |
| `validationCommandPatterns` | Unique, non-blank JavaScript regex sources matched case-insensitively against the complete command. A command is a validation when any pattern matches; an empty array records no validations. Invalid regex fails plugin load. |

## Projection semantics

### Capabilities and validations

Native calls fold from `tool/call` and `tool/result`. Code Mode excludes the outer `run_code` transport and folds its actual sub-calls from `tool/code-dispatch-start` and `tool/code-dispatch`, so one operation is never counted twice. Capabilities are sorted by tool name and report starts, settlements, failures, running calls, and the latest start time.

Configured command tools additionally decode lasmex shell exit, signal, timeout, and sandbox markers. A matching command enters `validations` as `running`, then becomes `passed` or `failed` with durable timestamps and wall time. A call still open at `turn/end` settles as failed and its retained validation becomes `interrupted`. Older validation rows are removed as a complete array once the configured bound is exceeded.

### Approval, checklist, and outcome

`approval/asked` and `approval/decided` produce whole-session audit totals without retaining question reasons. The latest `todo/write` snapshot remains visible across later turns. `turn/end` records built-in blocked, error, token-limit, interruption, and cancellation outcomes; a completed turn or an extension-defined reason clears the previous built-in outcome.

## Model Experience

### Request context and condition

#### What the model sees

Nothing. `missionActivity` is a host read projection and never enters derived message history, system prompts, or tool schemas.

#### Token effect

Zero direct or indirect model tokens.

#### KV Cache effect

None. Folding and serving the projection does not change any model request prefix or independent model call.

## Known Limitations and Deferred Work

- **Configured command protocol only** — validation status requires a configured tool with a string `command` argument and lasmex shell-rendered result markers; custom validation tools with another argument or result protocol appear only in capability totals until an explicit adapter is added.

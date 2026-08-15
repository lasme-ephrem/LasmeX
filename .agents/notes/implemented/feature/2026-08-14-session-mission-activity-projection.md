# Agent Note: Mission activity derives from durable session facts

Status: implemented

English | [中文](2026-08-14-session-mission-activity-projection.zh.md)

## Problem

A mission dashboard needs stable operational status across paging, reload, and Code Mode, but copying client-window state or adding presentation-specific session events would create another authority for facts the durable log already records. Counting the outer `run_code` transport would also duplicate its actual sub-tool work.

## Decision

`lasmex-session-mission` registers the host-only `missionActivity` whole-log projection on `ctx.sessionProjections`. It folds native calls, Code Mode sub-dispatches, todo snapshots, approval audit pairs, and turn endings already present in the session log. The projection adds no event type and does not modify the agent loop or model context.

The fold excludes the outer `run_code` transport and counts its durable sub-dispatch events. Explicit Cordis plugin configuration names command tools, case-insensitive JavaScript regex sources that classify validations, and the complete retained validation-array limit. Invalid or ambiguous entries fail plugin load. Calls left open at `turn/end` settle as interrupted failures, so no running state crosses the durable turn boundary.

The projection exposes only operational facts needed by a consumer: aggregate tool lifecycles, bounded validation commands and statuses, approval totals without reasons, the latest complete todo snapshot, and the latest built-in non-success turn outcome. Its internal state is plain JSON and its wire value is schema-validated by the projection registry.

## Alternatives considered

**Add mission-specific session events.** The source events already reconstruct every field, so new events would duplicate durable authority and introduce synchronization failure modes.

**Fold the client conversation window.** Paging and compaction make a window incomplete; a whole-log host projection preserves the same value for live, resumed, and cold reads.

**Count `run_code` as a capability.** It is a presentation transport around durable sub-dispatches, so counting both layers would inflate activity and hide the tools that performed the work.

## Testing

Package tests cover native and Code Mode calls, shell exit and policy markers, exact validation retention, malformed and unmatched commands, turn interruption, approval and todo state, late whole-log replay, registration disposal, and real Loader composition with explicit configuration.

## Consequences

Consumers receive one deterministic operational projection without reconstructing cross-event relations or receiving model reasoning. Validation classification remains intentionally deployment-specific and recognizes only configured string-command tools using the dsh shell result protocol; another command protocol requires an explicit adapter rather than heuristic inference.

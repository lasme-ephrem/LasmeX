# Agent Note: Mission is a projection-backed conversation view

Status: implemented

English | [中文](2026-08-14-mission-dashboard-view.zh.md)

## Problem

An operational dashboard must stay accurate across live updates, history paging, reload, and Code Mode without exposing transcript payloads or rebuilding durable facts in React. Missing optional capabilities must also remain distinguishable from valid zero or empty values.

## Decision

`lasmex-client-ui-mission` registers the session-scoped `mission` conversation view at order `5`. It reads the existing `goal`, `plan`, `permissions`, `todos`, `sessionStats`, and `tokenUsage` projections together with the `missionActivity` projection. React owns no business store and performs no event fold. Live status reads only the Session snapshot's running, pending-count, queue-count, open-state, removal, and paging fields. The orchestration card reads direct-child catalogs, child summaries, and background-job views from the existing Session list store; it opens only children carrying a catalog-derived direct-parent address.

The view never reads conversation nodes, messages, chunks, reasoning, request headers, or tool results. It renders exact validation commands and background-job labels only because Host APIs deliberately expose those bounded operational records for human surfaces. A missing projection produces an unavailable state; present null or empty values produce domain-specific neutral states. Missing child and job rows produce neutral empty states, while catalog and lifecycle labels map only exact published states. The ordinary Session paging callback loads earlier history without changing whole-log totals.

French is the complete primary product dictionary, with key-identical English and Simplified Chinese dictionaries. Semantic sections, definition lists, text state labels, a polite status region, visible focus, and a keyboard-operable paging button form the accessibility baseline.

## Alternatives considered

**Fold the loaded conversation window.** Paging and compaction make it incomplete, so status and totals would change when older pages load.

**Pass the complete Session snapshot to a dashboard helper.** That would make transcript fields available to presentation code even though the feature does not need them.

**Use zeros for absent capabilities.** Zero means a composed projection observed no events; absence means the deployment does not provide the capability. Combining them would be misleading.

## Testing

Package tests cover full and absent projections, French rendering, status precedence, safe-field selection, orchestration metadata and navigation, neutral empty states, paging, slot order and lifecycle, locale parity, and node-half behavior. The assembled Web replay covers Code Mode capability activity, history paging, reload persistence, and a stable accessibility snapshot.

## Consequences

Mission remains a replaceable client plugin and introduces no new client state authority. Assemblies must mount each desired Host projection. The first GUI pull request that includes this view must attach a GIF recorded from the stable assembled server and real model flow.

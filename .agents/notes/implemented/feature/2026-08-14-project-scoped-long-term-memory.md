# Agent Note: Project-scoped long-term memory

Status: implemented

English | [中文](2026-08-14-project-scoped-long-term-memory.zh.md)

## Problem

LasmeX needs durable facts that survive Sessions without turning prior conversation, reasoning, or summaries into an implicit data-collection pipeline. A memory keyed only by an opaque id or process-wide singleton could also leak facts between unrelated repositories. Model-driven writes require a visible deployment decision because a useful memory tool is also a durable side effect.

## Decision

Long-term memory is one complete capability seam. `lasmex-memory` defines branded memory ids, a normalized absolute-cwd project scope, bounded reads and mutations, and provider limits. `lasmex-memory-storage-domain` owns the versioned durable records and literal search. `lasmex-tool-memory` owns model-facing list, search, read, save, and forget operations.

There is no implicit global scope. Every Consumer operation derives the project from the calling Agent Session's `cwd`; absent or relative working directories fail. The first project identity deliberately uses platform path normalization without filesystem realpath lookup. A future workspace identity may replace it only as a coordinated storage-identity change.

The tool Consumer requires `mutationPolicy: approval | allow`. In `approval` mode every save and forget calls `ctx.approval.request`, forwards the tool call identity and cancellation signal, and writes only after the exact `allowed-once` outcome. All other outcomes fail closed. `allow` is an equally explicit deployment choice for trusted unattended compositions. The service and provider do not infer authorization because same-process non-model Consumers may have different policy owners.

Pinned memories may enter `systemPrompt.context()` only within mandatory item and complete UTF-8 byte caps. The Consumer includes whole JSON records or omits them; it never truncates an individual statement. Existing runtime-context projection materializes the exact assembled text as a source-attributed `user/message`, so replay preserves what the model saw even if durable memory changes later. The provider does not extend the provider/model-only `request/context` event.

No component observes conversation events to create memory. Saving and forgetting are explicit calls only. The [recallable compaction proposal](../../proposed/feature/2026-07-06-recallable-compaction.md) remains separate because it concerns model-generated, same-Session working memory during compaction rather than durable project facts.

The product base owns one JSON storage hub, domain facility, and memory provider. Interactive `lasmex-code`, `standard`, and `cordis` presets mount the Consumer with `approval`; the unattended headless profile mounts it with explicit `allow`. The `minimal` preset omits the Consumer, so its intentionally small tool and request-context surface stays unchanged.

## Consequences

Project memory survives process restarts, stays isolated by normalized `cwd`, and has bounded record, query, result, preview, capacity, and prompt costs. Concurrent in-process creates cannot race past project capacity. Deployments can inspect the mutation policy in configuration and approval audit pairs in the Session log.

Pinned context adds durable model-visible Session messages. Changing current pinned records affects only newly assembled request suffixes; replay uses prior snapshots. Cross-process compare-and-swap, semantic retrieval, automatic extraction, global user memory, and a desktop management UI are not part of this foundation.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Automatically summarize completed conversations into memory | It would collect reasoning and user text without an explicit mutation and make deletion provenance unclear. |
| Use one process-wide or user-wide memory namespace | An opaque global namespace can surface facts in an unrelated repository and gives no reliable project ownership check. |
| Put authorization inside the storage provider | The provider cannot distinguish a trusted host write from a model-requested tool mutation; policy belongs at the Consumer that exposes the side effect. |
| Re-read pinned memory during Session replay | Replay would reconstruct today's memory rather than the exact context used for the historical model request. |
| Extend `request/context` with memory text | That event owns route metadata; the existing source-attributed runtime-context message already preserves model-visible text without widening agent-loop state. |

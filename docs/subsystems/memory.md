# Long-term memory

English | [中文](memory.zh.md)

The memory subsystem stores explicit project facts across Sessions. It is a complete [capability seam](../glossary.md#capability-seam): [`lasmex-memory`](../../packages/memory/memory) defines `ctx.memory`, [`lasmex-memory-storage-domain`](../../packages/memory/memory-storage-domain) provides durable records over the [storage domain](storage.md), and [`lasmex-tool-memory`](../../packages/memory/tool-memory) exposes the model-facing Consumer. No package observes conversation, reasoning, summaries, or tool results to create records automatically.

Source: [`packages/memory/memory/src/index.ts`](../../packages/memory/memory/src/index.ts) · [`packages/memory/memory-storage-domain/src/index.ts`](../../packages/memory/memory-storage-domain/src/index.ts) · [`packages/memory/tool-memory/src/index.ts`](../../packages/memory/tool-memory/src/index.ts)

## Project identity and records

Every operation carries a `ProjectMemoryScope` derived from an absolute Session `cwd` through platform path normalization. Missing and relative working directories fail, and there is no implicit global or user-wide scope. The identity deliberately does not resolve filesystem realpaths, so changing that rule would be a storage-identity migration rather than a local implementation detail.

`MemoryId` is provider-created and opaque. A durable `MemoryRecord` contains its project, optional title, complete content, search tags, pinned flag, and creation/update timestamps. List results omit content; literal search results add a provider-sized preview. Reads check both the id and project, so an id from another project behaves as absent.

## Bounds and durability

The provider requires explicit limits for complete record bytes, query bytes, result count, preview bytes, and records per project. It validates stored media when the domain opens and rejects values that exceed the active limits. Creates for one project are serialized in-process so concurrent calls cannot exceed its capacity. The storage-domain backend commits each accepted mutation before the service resolves it.

The shipped base composition uses the JSON storage backend under `$LASMEX_HOME/storages`, admits records up to 16 KiB, literal queries up to 1 KiB, at most 20 results, 512-byte previews, and 1,000 records per project. These are deployment configuration values, not hidden defaults.

## Consumer policy and model context

The Consumer registers `memory_list`, `memory_search`, `memory_read`, `memory_save`, and `memory_forget`. Its mandatory `mutationPolicy` is either `approval` or `allow`. The shipped interactive `lasmex-code`, `standard`, and `cordis` presets use `approval`; each save or forget writes only after `ctx.approval.request()` returns `allowed-once`. The unattended headless profile selects `allow` explicitly. The `minimal` preset omits the Consumer and therefore receives neither memory tools nor pinned memory context.

Pinned records may enter `systemPrompt.context()` only within mandatory item and complete UTF-8 byte caps. The Consumer serializes whole records and omits an entry that does not fit. The system-prompt runtime materializes the exact assembled text as a source-attributed `user/message`, so later replay uses the historical model input rather than current mutable storage. The memory service does not extend `request/context`, which owns provider and model route metadata.

Design record: [project-scoped long-term memory](../../.agents/notes/implemented/feature/2026-08-14-project-scoped-long-term-memory.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmemory--memoryservice-abstract-seam"></a>

### `ctx.memory` — `MemoryService` (abstract seam)

Provider-independent long-term memory service. Providers own bounded reads, search semantics, durable mutations, and record lifecycle.

```ts cordis-catalog
/**
 * Read a complete record in one project.
 * @param request - Project and record identity.
 * @returns an immutable record, or `undefined` when absent from that project.
 */
abstract read(request: MemoryReadRequest): MemoryRecord | undefined

/**
 * List recent summaries in one project.
 * @param request - Project and bounded result count.
 * @returns immutable summaries ordered newest first.
 */
abstract list(request: MemoryListRequest): readonly MemorySummary[]

/**
 * List recent pinned records in one project for bounded prompt assembly.
 * @param request - Project and bounded result count.
 * @returns immutable complete records ordered newest first.
 */
abstract listPinned(request: MemoryListRequest): readonly MemoryRecord[]

/**
 * Search one project's title, content, and tags.
 * @param request - Project, literal query, and bounded result count.
 * @returns immutable hits ordered newest first.
 */
abstract search(request: MemorySearchRequest): readonly MemorySearchHit[]

/**
 * Create or replace one project record.
 * @param request - Complete desired record fields.
 * @returns the immutable durable record after the write lands.
 */
abstract save(request: MemorySaveRequest): Promise<MemoryRecord>

/**
 * Delete one project record.
 * @param request - Project and record identity.
 * @returns `true` when a record was deleted, otherwise `false`.
 */
abstract forget(request: MemoryForgetRequest): Promise<boolean>
```

Source: [`packages/memory/memory/src/index.ts:131`](../../packages/memory/memory/src/index.ts)
<!-- END GENERATED cordis-surface -->

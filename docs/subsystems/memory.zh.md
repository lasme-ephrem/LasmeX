# 长期记忆

[English](memory.md) | 中文

记忆子系统用于跨 Session 保存显式的项目事实。它是一条完整的 [capability seam](../glossary.md#capability-seam)：[`lasmex-memory`](../../packages/memory/memory) 定义 `ctx.memory`，[`lasmex-memory-storage-domain`](../../packages/memory/memory-storage-domain) 通过[存储 domain](storage.md)提供持久记录，[`lasmex-tool-memory`](../../packages/memory/tool-memory) 提供面向模型的 Consumer。任何包都不会通过观察对话、推理、摘要或工具结果自动创建记录。

源码：[`packages/memory/memory/src/index.ts`](../../packages/memory/memory/src/index.ts) · [`packages/memory/memory-storage-domain/src/index.ts`](../../packages/memory/memory-storage-domain/src/index.ts) · [`packages/memory/tool-memory/src/index.ts`](../../packages/memory/tool-memory/src/index.ts)

## 项目标识与记录

每次操作都携带从绝对 Session `cwd` 经平台路径规范化派生的 `ProjectMemoryScope`。缺失或相对工作目录会失败，也不存在隐式的全局或用户级作用域。该身份有意不解析文件系统 realpath，因此改变这条规则属于存储身份迁移，而不是局部实现细节。

`MemoryId` 由 provider 创建且不透明。持久 `MemoryRecord` 包含项目、可选标题、完整内容、搜索标签、置顶标志以及创建／更新时间戳。列表结果省略内容；字面搜索结果增加由 provider 限制大小的预览。读取同时检查 id 与项目，因此来自另一项目的 id 会被视为不存在。

## 限额与持久化

Provider 强制要求显式配置完整记录字节数、查询字节数、结果数、预览字节数以及每个项目的记录数上限。Domain 打开时会按当前限额验证已有介质，并拒绝超过限额的值。同一项目的创建在进程内串行执行，因此并发调用无法突破容量。Storage-domain 后端会先提交每个已准入变更，服务随后才解析完成。

随产品交付的 base 组合在 `$LASMEX_HOME/storages` 下使用 JSON 存储后端，允许最大 16 KiB 的记录、1 KiB 的字面查询、最多 20 条结果、512 字节预览以及每项目 1,000 条记录。这些是部署配置值，不是隐藏默认值。

## Consumer 策略与模型上下文

Consumer 注册 `memory_list`、`memory_search`、`memory_read`、`memory_save` 和 `memory_forget`。其必填 `mutationPolicy` 只能为 `approval` 或 `allow`。随产品交付的交互式 `lasmex-code`、`standard` 和 `cordis` 预设使用 `approval`；每次保存或遗忘只有在 `ctx.approval.request()` 返回 `allowed-once` 后才写入。无人值守的 headless profile 显式选择 `allow`。`minimal` 预设省略 Consumer，因此既没有记忆工具，也没有置顶记忆上下文。

只有在必填的条目数和完整 UTF-8 字节上限内，置顶记录才能进入 `systemPrompt.context()`。Consumer 会序列化完整记录，并省略无法完整容纳的条目。System-prompt runtime 将准确组装的文本具体化为带来源的 `user/message`，因此后续重放使用历史模型输入，而不是当前可变存储。记忆服务不会扩展仅负责 provider 与 model 路由元数据的 `request/context`。

设计记录：[项目作用域长期记忆](../../.agents/notes/implemented/feature/2026-08-14-project-scoped-long-term-memory.md)。

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

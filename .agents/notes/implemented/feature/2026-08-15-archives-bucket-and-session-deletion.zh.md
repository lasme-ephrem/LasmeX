# Agent Note: 归档分组与持久化会话删除

Status: implemented

[English](2026-08-15-archives-bucket-and-session-deletion.md) | 中文

## Problem

归档会话会把它从所有分组视图中隐藏，但之后没有任何界面显示已归档的会话，因此归档后的对话在 UI 中不可见、无法找回。产品中也不存在删除会话的能力：持久化的会话日志只能靠手工删除文件。工作区浏览器因此无法提供自然的归档工作流——先归档，稍后检查或永久删除。

## Decision

工作区浏览器派生出一个归档分组，仅当注册表级归档集合非空时出现。其中的行保持 Host 归档顺序，并提供两个菜单动作：恢复与删除。删除是会话唯一的破坏性路径，提交前会打开浏览器持有的确认对话框。

归档会话以只读形式打开：工作区投影会把当前会话的输入区标记为冻结（`Session` 快照中的 `archived` 位，与 `removed` 冻结对称），取消归档会在原地解冻同一个已打开的输入区。这取代了此前的“归档即清空选中”规则——归档行现在是可点击的。Host 以 `session-archived` 拒绝会话写入（`session.prompt`、`session.updateQueue`）；重命名与分叉仍然可用。以 `session-running` 拒绝归档仍在运行的会话，使活跃代理永远不会在冻结视图背后继续写日志；浏览器用说明对话框展示该拒绝。

恢复即 `unarchiveSession`：注册表仅移除归档条目——工作区账户从未被改动，因此行会回到其存储位置。

删除是一条完整的能力接缝。`SessionPersistence` 新增抽象方法 `delete(id)`（幂等：不存在的会话正常返回）。JSONL 后端删除该会话的整个目录；SQLite 后端删除 `sessions` 行并由 `ON DELETE CASCADE` 级联删除事件。删除前，网关会先关闭该会话的代理：仍在运行的代理以 `session-running` 拒绝；空闲的在线代理——通过 resolver 恢复的、由 `session.create` 创建的，或由 `session.fork` 创建的，网关均保留其句柄——会被销毁，因此打开、创建或分叉过会话都不会阻塞其删除。`WorkspaceRegistry.deleteSession(sessionId)` 以 `WorkspaceLiveSessionError` 拒绝剩余的仍在运行的会话、以 `WorkspaceUnknownSessionError` 拒绝未知 id；随后丢弃 header 索引、删除持久化日志、从每个工作区账户中分离（读取持久化记录，而不是被 header 过滤的 getter）、移除归档条目，并发出新的 Cordis 事件 `workspace/session-removed`。API 代理把该事件映射为既有的 `host/session-removed` 帧，客户端列表已据此退役会话。

线上接缝为 `workspace.deleteSession`（`{ sessionId }` → `{ archivedSessionIds }`），业务错误为 `session-not-found` 与新增的 `session-live` 代码。`workspace.unarchiveSession` 共享归档的载荷形状。运行时与归档相同，从一元回显安装返回的归档集合。

归档保持非破坏性并保留其记账槽位；只有显式删除才会销毁日志。未分组与归档分组不是工作区：它们的表头没有工作区菜单，也没有创建动作。归档分组的账户键加入浏览器的保留清理，因此删除后的清理不会折叠已展开的分组。

## Consequences

归档会话在分组模式下可见于归档分组；单列表模式与搜索仍会隐藏它们，归档分组随归档集合出现或消失。点击归档会话会以冻结形式打开其对话（输入区禁用并显示专属占位符）；从行菜单恢复会把该行送回其工作区，并原地解冻已打开的输入区。归档运行中的会话会显示说明性拒绝，而不是静默成功。会话归档期间，来自任何客户端的对话写入都会被拒绝。删除已归档会话会移除其持久化日志——即使该会话先前以只读方式打开过（其已恢复的代理会先被关闭）——因此该动作由确认对话框保护，并在菜单中以危险行呈现。仍在运行的会话无法删除；Host 以 `session-running` 拒绝，对话框展示该消息。未知会话继续以 `session-not-found` 失败。

归档工作流从此可以在 UI 中查看、恢复和终结，持久化会话删除作为接缝存在，所有后端均已实现。

## Alternatives considered

| Alternative | Contract mismatch |
|---|---|
| 从任意分组的行菜单删除 | 未加保护的删除动词会出现在普通行上；需求的工作流是先归档后删除，归档分组把破坏性动作集中在一个可复查的位置。 |
| 归档时自动删除 | 归档承诺保留（日志与记账槽位），静默丢失数据与该承诺相矛盾。 |
| 归档会话保持不可打开 | 行可见且可点击，死点击会被当成缺陷；只读打开让归档可查阅。 |
| 保留“归档即清空选中”的清理规则 | 原地冻结可同时覆盖本地归档与其他标签页的帧，且恢复时无需重载即可解冻。 |
| 允许归档运行中的会话 | 活跃代理会在冻结的只读视图背后继续写日志；Host 以 `session-running` 拒绝并由 UI 说明。 |
| 阻止归档会话的重命名/分叉 | 这些是无害的元数据写入；仅拒绝对话写入（prompt/queue）。 |
| 注册表通过被 header 过滤的 `entity.sessionIds` 删除 | 丢弃 header 索引后 getter 不再报告该 id，持久化记录会保留幽灵条目直到下次 bootstrap；直接读取记录可立即分离。 |
| 复用既有错误代码表示运行中会话 | `session-not-found` 表示不存在而非拒绝运行中；专属的 `session-live` 代码让 UI 能提示“请先关闭”。 |

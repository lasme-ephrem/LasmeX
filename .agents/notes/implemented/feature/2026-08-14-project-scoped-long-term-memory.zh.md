# Agent Note: 项目作用域长期记忆

Status: implemented

[English](2026-08-14-project-scoped-long-term-memory.md) | 中文

## 问题

LasmeX 需要可跨 Session 保留的持久事实，同时不能把先前对话、推理或摘要变成隐式数据收集管道。仅按不透明 id 或进程级单例组织的记忆还可能在无关仓库之间泄露事实。模型驱动写入是持久副作用，因此需要可见的部署决策。

## 决定

长期记忆是一条完整 capability seam。`lasmex-memory` 定义品牌化记忆 id、由规范化绝对 cwd 表示的项目作用域、受限读写和 provider 限额。`lasmex-memory-storage-domain` 负责带版本的持久记录与字面搜索。`lasmex-tool-memory` 负责模型侧列表、搜索、读取、保存和遗忘操作。

不存在隐式全局作用域。每个 Consumer 操作都从调用方 Agent Session 的 `cwd` 派生项目；缺少工作目录或目录为相对路径时会失败。首个项目身份有意采用平台路径规范化，而不查询文件系统 realpath。未来的工作区身份只能作为协调一致的存储身份变更来替换它。

工具 Consumer 强制要求 `mutationPolicy: approval | allow`。在 `approval` 模式下，每次保存和遗忘都会调用 `ctx.approval.request`，转发工具调用身份与取消信号，并且仅在结果精确等于 `allowed-once` 后写入。其他结果全部失败并保持关闭。对于可信的无人值守组合，`allow` 同样是明确的部署选择。服务和 provider 不推断授权，因为同进程的非模型 Consumer 可能由不同策略所有者管理。

只有在强制项目数和完整 UTF-8 字节上限内，置顶记忆才能进入 `systemPrompt.context()`。Consumer 只包含完整 JSON 记录，无法容纳时就省略；绝不会截断单条陈述。现有运行时上下文投影会把组装后的精确文本具体化为带来源的 `user/message`，因此即使持久记忆后来变化，重放仍保留模型当时看到的内容。Provider 不扩展仅归属 provider／model 路由信息的 `request/context` 事件。

任何组件都不会通过观察对话事件来创建记忆。保存与遗忘只能由显式调用触发。[可召回压缩提案](../../proposed/feature/2026-07-06-recallable-compaction.md)继续保持独立，因为它关注压缩期间由模型生成、仅属于同一 Session 的工作记忆，而不是持久项目事实。

产品 base 持有一个 JSON 存储中心、domain facility 和记忆 provider。交互式 `lasmex-code`、`standard` 与 `cordis` 预设以 `approval` 挂载 Consumer；无人值守的 headless profile 以显式 `allow` 挂载。`minimal` 预设省略 Consumer，因此其刻意精简的工具与请求上下文表层保持不变。

## 影响

项目记忆可跨进程重启保留，按规范化 `cwd` 隔离，并对记录、查询、结果、预览、容量和提示词成本设限。单进程并发创建无法竞态突破项目容量。部署方可以在配置中检查变更策略，并在 Session 日志中检查审批审计对。

置顶上下文会增加持久的模型可见 Session 消息。当前置顶记录变化只影响新组装的请求后缀；重放采用先前快照。跨进程 compare-and-swap、语义检索、自动提取、全局用户记忆和桌面管理界面不属于此基础层。

## 考虑过的替代方案

| 替代方案 | 拒绝原因 |
|---|---|
| 自动把已完成对话总结为记忆 | 这会在没有显式变更的情况下收集推理和用户文本，并使删除来源不明确。 |
| 使用单一进程级或用户级记忆命名空间 | 不透明的全局命名空间可能在无关仓库中呈现事实，也无法可靠检查项目归属。 |
| 把授权放入存储 provider | Provider 无法区分可信主机写入和模型请求的工具变更；策略属于公开副作用的 Consumer。 |
| Session 重放时重新读取置顶记忆 | 重放会重建今天的记忆，而不是历史模型请求实际使用的精确上下文。 |
| 用记忆文本扩展 `request/context` | 该事件负责路由元数据；现有带来源的运行时上下文消息已经能保存模型可见文本，无需扩大 agent-loop 状态。 |

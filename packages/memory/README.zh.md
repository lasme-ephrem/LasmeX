# 记忆包

[English](README.md) | 中文

项目作用域长期记忆是一条完整 capability seam：

| 包 | 角色 | Cordis 表层 |
| --- | --- | --- |
| [`memory`](memory/README.md) | Service Definition 与品牌化项目记忆类型 | `ctx.memory` |
| [`memory-storage-domain`](memory-storage-domain/README.md) | 基于 `ctx.storageDomain` 的持久 provider | 提供 `ctx.memory` |
| [`tool-memory`](tool-memory/README.md) | 面向模型的列表、搜索、读取、保存、遗忘与置顶上下文 Consumer | 读取 `ctx.memory`；向 `ctx.tools` 与 `ctx.systemPrompt` 贡献内容 |

Provider 负责记录与查询限额。Consumer 负责变更准入，并从调用方 Session `cwd` 派生每个项目；不存在隐式全局作用域，也不会自动提取对话。参见[子系统参考](../../docs/subsystems/memory.md)。
